function makeTopsMemberFunction(memberThis, topsFunctionString, globalInfo = { enums: {} }) {
    let watOutput = [];
    const localVariables = new Map(); // Stores { name: { watType: "i32", isParam: true/false, index: N } }
    let nextParamIndex = 0;
    let localDeclarationsWat = []; // Will be populated by parsing functions

    // Helper to map Tops types to WAT types
    function topsTypeToWatType(topsType) {
        switch (topsType) {
            case "void": return "";
            case "bool": case "char":
            case "int1": case "uint1":
            case "int2": case "uint2":
            case "int4": case "uint4":
                return "i32";
            case "int8": case "uint8":
                return "i64";
            case "float4": return "f32";
            case "float8": return "f64";
            default: return "i32"; // Pointers, arrays, unknown
        }
    }

    const sigRegex = /^\s*(?<returnType>\S+)\s+(?<funcName>\S+)\s*\((?<paramsStr>[^)]*)\)\s*\{(?<body>.*)\}\s*$/s;
    const sigMatch = topsFunctionString.match(sigRegex);

    if (!sigMatch || !sigMatch.groups) {
        throw new Error(`Invalid function string format: ${topsFunctionString}`);
    }

    const { returnType: topsReturnType, funcName, paramsStr, body: bodyStr } = sigMatch.groups;
    const watFuncName = `${memberThis.className}_${funcName}`;
    let signatureWat = `(func $${watFuncName}`;

    const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
    if (params.length > 0 && params[0] === "this") {
        signatureWat += ` (param $this i32)`;
        localVariables.set("this", { watType: "i32", isParam: true, index: nextParamIndex++ });
        params.shift();
    }

    for (const paramDef of params) {
        const parts = paramDef.split(/\s+/);
        if (parts.length < 2) continue;
        const paramType = parts[0];
        const paramName = parts[1];
        const watParamType = topsTypeToWatType(paramType);
        signatureWat += ` (param $${paramName} ${watParamType}) ;; Tops Type: ${paramType}`;
        localVariables.set(paramName, { watType: watParamType, topsType: paramType, isParam: true, index: nextParamIndex++ }); // Store Tops type
    }

    const watReturnType = topsTypeToWatType(topsReturnType);
    if (watReturnType) {
        signatureWat += ` (result ${watReturnType})`;
    }
    signatureWat += "\n";

    const funcDetails = {
        watFuncName, topsReturnType, localVariables, memberThis, globalInfo,
        localDeclarationsWat, // Pass by reference to be modified
        topsTypeToWatType, // Make helper available
        currentLoopExitLabel: null // For 'break' statements
    };

    const bodyWat = parseBodyStatements(bodyStr.trim(), funcDetails);

    watOutput.push(signatureWat);
    watOutput.push(...localDeclarationsWat);
    watOutput.push(...bodyWat);
    watOutput.push(`) ;; end func $${watFuncName}\n`);

    return watOutput.join("");
}

function extractDelimitedBlock(code, openChar = '{', closeChar = '}') {
    let startIndex = code.indexOf(openChar);
    if (startIndex === -1) return null;

    let depth = 1;
    let endIndex = startIndex + 1;
    while (endIndex < code.length && depth > 0) {
        if (code[endIndex] === openChar) depth++;
        else if (code[endIndex] === closeChar) depth--;
        endIndex++;
    }

    if (depth !== 0) return null; // Mismatched delimiters

    const blockContent = code.substring(startIndex + 1, endIndex - 1).trim();
    const consumedLength = endIndex; // Length of the full "...{...}" part
    return { blockContent, consumedLength };
}


function parseCondition(conditionStr, funcDetails) {
    const { localVariables, topsTypeToWatType } = funcDetails;
    conditionStr = conditionStr.trim();
    // Simple condition parser: var op literal (e.g., x < 10, y == 0, flag)
    // Regex for: variable, optional_comparison_operator, variable_or_literal
    const condRegex = /^\s*(\w+)\s*(?:([<>=!]=?|&&|\|\|)\s*(\w+|\d+))?\s*$/;
    const match = conditionStr.match(condRegex);

    if (!match) return { wat: [`  ;; Unparsable condition: ${conditionStr}\n  (i32.const 0) ;; Placeholder\n`], consumedLength: conditionStr.length };

    const lhs = match[1];
    const op = match[2];
    const rhs = match[3];

    let conditionWat = [];

    if (!localVariables.has(lhs)) {
        return { wat: [`  ;; Condition LHS var '${lhs}' not found\n  (i32.const 0)\n`], consumedLength: conditionStr.length };
    }
    conditionWat.push(`  (local.get $${lhs})\n`);

    if (op && rhs) { // Binary operation
        if (localVariables.has(rhs)) {
            conditionWat.push(`  (local.get $${rhs})\n`);
        } else if (rhs.match(/^\d+$/)) {
            conditionWat.push(`  (i32.const ${rhs})\n`); // Assuming i32 for now
        } else if (rhs === "true") {
            conditionWat.push(`  (i32.const 1)\n`);
        } else if (rhs === "false") {
            conditionWat.push(`  (i32.const 0)\n`);
        } else {
            return { wat: [`  ;; Condition RHS '${rhs}' not found or not literal\n  (i32.const 0)\n`], consumedLength: conditionStr.length };
        }

        switch (op) {
            case "<": conditionWat.push("  (i32.lt_s)\n"); break; // Assuming signed int comparison
            case "<=": conditionWat.push("  (i32.le_s)\n"); break;
            case ">": conditionWat.push("  (i32.gt_s)\n"); break;
            case ">=": conditionWat.push("  (i32.ge_s)\n"); break;
            case "==": conditionWat.push("  (i32.eq)\n"); break;
            case "!=": conditionWat.push("  (i32.ne)\n"); break;
            // TODO: &&, || would require more complex short-circuiting logic or temp vars
            default:
                conditionWat.push(`  ;; Unsupported condition operator: ${op}\n  (drop)\n  (drop)\n  (i32.const 0)\n`);
                break;
        }
    } else {
        // If it's just a variable (e.g., `if (myBool)`), it's already on the stack.
        // WAT `if` consumes an i32; 0 is false, non-zero is true.
    }
    return { wat: conditionWat, consumedLength: conditionStr.length };
}

function tryParseIfElseChain(code, funcDetails) {
    const ifRegex = /^\s*if\s*\((?<condition>[^)]*)\)/s;
    const ifMatch = code.match(ifRegex);
    if (!ifMatch) return null;

    let currentCode = code.substring(ifMatch[0].length);
    const condition = ifMatch.groups.condition;

    const ifBlockExtract = extractDelimitedBlock(currentCode.trimStart(), '{', '}');
    if (!ifBlockExtract) return { wat: [`  ;; Malformed if block for condition: ${condition}\n`], consumedLength: ifMatch[0].length };

    const ifBody = ifBlockExtract.blockContent;
    currentCode = currentCode.trimStart().substring(ifBlockExtract.consumedLength);

    const conditionResult = parseCondition(condition, funcDetails);
    let ifWat = [...conditionResult.wat];
    ifWat.push("  (if\n"); // No result type for if-then-else block itself unless specified
    ifWat.push("    (then\n");
    ifWat.push(...parseBodyStatements(ifBody, funcDetails).map(l => `    ${l}`)); // Indent
    ifWat.push("    )\n");

    let consumedLength = ifMatch[0].length + ifBlockExtract.consumedLength;

    // Check for 'else if' or 'else'
    currentCode = currentCode.trimStart();
    const elseIfRegex = /^\s*else\s+if\s*\((?<conditionElseIf>[^)]*)\)/s;
    const elseRegex = /^\s*else\s*/s;

    let elseIfMatch = currentCode.match(elseIfRegex);
    let elseMatch = !elseIfMatch ? currentCode.match(elseRegex) : null;

    if (elseIfMatch) {
        ifWat.push("    (else ;; chain to else if\n");
        const elseIfResult = tryParseIfElseChain(currentCode, funcDetails); // Recursive call for the rest of the chain
        if (elseIfResult) {
            ifWat.push(...elseIfResult.wat.map(l => `    ${l}`)); // Indent
            consumedLength += elseIfResult.consumedLength;
        } else {
             ifWat.push(`      ;; Malformed else if part\n`);
        }
        ifWat.push("    )\n"); // else
    } else if (elseMatch) {
        ifWat.push("    (else\n");
        let elseBlockCode = currentCode.substring(elseMatch[0].length).trimStart();
        const elseBlockExtract = extractDelimitedBlock(elseBlockCode, '{', '}');
        if (elseBlockExtract) {
            ifWat.push(...parseBodyStatements(elseBlockExtract.blockContent, funcDetails).map(l => `    ${l}`));
            consumedLength += elseMatch[0].length + elseBlockExtract.consumedLength;
        } else {
            ifWat.push(`      ;; Malformed else block\n`);
            // If no block, maybe a single statement? (Not supported by Tops spec here)
        }
        ifWat.push("    )\n"); // else
    }
    // If no else/else if, the if block is implicitly closed by WAT

    ifWat.push("  )\n"); // if
    return { wat: ifWat, consumedLength };
}


function tryParseEswitch(code, funcDetails) {
    const { localVariables, memberThis, globalInfo, watFuncName, topsTypeToWatType } = funcDetails;
    const eswitchBlockRegex = /^\s*eswitch\s*\((?<enumVarName>\w+)\)\s*\{(?<innerBody>[\s\S]*?)\}(?:\s*;)?/s;
    const eswitchMatch = code.match(eswitchBlockRegex);

    if (!eswitchMatch) return null;

    const fullMatchText = eswitchMatch[0];
    const { enumVarName, innerBody } = eswitchMatch.groups;
    let eswitchWat = [];

    const propEnum = memberThis.properties[enumVarName];
    if (!propEnum) {
        eswitchWat.push(`  ;; ERROR: Enum var '${enumVarName}' not found. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
        return { wat: eswitchWat, consumedLength: fullMatchText.length };
    }
    const enumDefinition = globalInfo.enums[propEnum.type];
    if (!enumDefinition) {
        eswitchWat.push(`  ;; ERROR: Enum def for type '${propEnum.type}' not found. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
        return { wat: eswitchWat, consumedLength: fullMatchText.length };
    }

    const parsedCaseActions = [];
    let parsedDefaultAction = null;
    const entryRegex = /(?<type>case)\s+(?<caseEnumName>\w+)\.(?<memberName>\w+)\s*:\s*(?<caseCode>[^;]*?);|(?<typeDefault>default)\s*:\s*(?<defaultCode>[^;]*?);/g;
    let entryMatch;
    const cleanedInnerBody = innerBody.trim();

    while ((entryMatch = entryRegex.exec(cleanedInnerBody)) !== null) {
        if (entryMatch.groups.type === 'case') {
            const { caseEnumName, memberName, caseCode } = entryMatch.groups;
            if (caseEnumName !== enumVarName) {
                eswitchWat.push(`  ;; ERROR: eswitch case path '${caseEnumName}.${memberName}' mismatch '${enumVarName}'.\n`);
                continue;
            }
            if (typeof enumDefinition[memberName] === 'undefined') {
                eswitchWat.push(`  ;; ERROR: Enum member '${memberName}' not in '${propEnum.type}'.\n`);
                continue;
            }
            // For eswitch, assume simple return statements for now
            const returnMatch = caseCode.trim().match(/^return\s+(true|false|\d+)/);
            if (returnMatch) {
                parsedCaseActions.push({
                    memberName: memberName, value: enumDefinition[memberName],
                    returnValue: returnMatch[1]
                });
            } else {
                eswitchWat.push(`  ;; ERROR: eswitch case for '${enumVarName}.${memberName}' complex code not supported: ${caseCode.trim()}.\n`);
            }
        } else if (entryMatch.groups.typeDefault === 'default') {
            const { defaultCode } = entryMatch.groups;
            const returnMatch = defaultCode.trim().match(/^return\s+(true|false|\d+)/);
            if (returnMatch) {
                parsedDefaultAction = { returnValue: returnMatch[1] };
            } else {
                eswitchWat.push(`  ;; ERROR: eswitch default complex code not supported: ${defaultCode.trim()}.\n`);
            }
        }
    }

    if (!parsedDefaultAction) {
        eswitchWat.push(`  ;; ERROR: eswitch for '${enumVarName}' missing default. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
        return { wat: eswitchWat, consumedLength: fullMatchText.length };
    }

    let maxEnumValue = -1;
    for (const member in enumDefinition) {
        if (enumDefinition.hasOwnProperty(member) && typeof enumDefinition[member] === 'number') {
            if (enumDefinition[member] > maxEnumValue) maxEnumValue = enumDefinition[member];
        }
    }
    if (maxEnumValue < 0 && parsedCaseActions.length > 0) {
        maxEnumValue = parsedCaseActions.reduce((max, p) => (typeof p.value === 'number' ? Math.max(max, p.value) : max), -1);
    }
    if (maxEnumValue < 0) {
        eswitchWat.push(`  ;; ERROR: Could not determine max enum value for '${propEnum.type}'. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
        return { wat: eswitchWat, consumedLength: fullMatchText.length };
    }

    const eswitchLabelBase = `eswitch_${watFuncName.replace(/[^a-zA-Z0-9_]/g, '_')}_${enumVarName}`;
    const getCaseLabel = (val) => `${eswitchLabelBase}_case_${val}`;
    const defaultLabel = `${eswitchLabelBase}_default`;
    const brTableLabels = new Array(maxEnumValue + 1);
    const caseWatBlocks = new Map();

    for (const action of parsedCaseActions) {
        if (typeof action.value !== 'number' || action.value < 0) continue;
        const label = getCaseLabel(action.value);
        if (action.value < brTableLabels.length) brTableLabels[action.value] = label;
        const retValConst = action.returnValue === "true" ? "(i32.const 1)" :
                            action.returnValue === "false" ? "(i32.const 0)" :
                            `(i32.const ${action.returnValue})`;
        caseWatBlocks.set(label, `  (block $${label} ;; ${enumVarName}.${action.memberName}\n    ${retValConst}\n    (return)\n  )\n`);
    }
    for (let i = 0; i <= maxEnumValue; i++) {
        if (!brTableLabels[i]) brTableLabels[i] = defaultLabel;
    }

    eswitchWat.push(`  ;; eswitch (${enumVarName})\n`);
    eswitchWat.push(`  (local.get $this)\n  (i32.const ${propEnum.offset})\n  (i32.add)\n`);
    eswitchWat.push(`  (i32.load) ;; Load enum ${enumVarName}\n`);
    eswitchWat.push(`  (br_table ${brTableLabels.map(l => `$${l}`).join(' ')} $${defaultLabel})\n`);

    const emittedLabels = new Set();
    for (const label of brTableLabels) {
        if (label !== defaultLabel && caseWatBlocks.has(label) && !emittedLabels.has(label)) {
            eswitchWat.push(caseWatBlocks.get(label));
            emittedLabels.add(label);
        }
    }
    const defaultRetValConst = parsedDefaultAction.returnValue === "true" ? "(i32.const 1)" :
                               parsedDefaultAction.returnValue === "false" ? "(i32.const 0)" :
                               `(i32.const ${parsedDefaultAction.returnValue})`;
    eswitchWat.push(`  (block $${defaultLabel} ;; default for ${enumVarName}\n    ${defaultRetValConst}\n    (return)\n  )\n`);
    eswitchWat.push(`  (unreachable) ;; After eswitch\n`);
    return { wat: eswitchWat, consumedLength: fullMatchText.length };
}

function tryParseLoop(code, funcDetails) {
    const { watFuncName } = funcDetails;
    // Regex: loop (<initializer_statement_without_semicolon>;) { <loopBody> } optional_semicolon
    const loopRegex = /^\s*loop\s*\((?<initializer>[^;]+;)\)\s*\{(?<loopBody>[\s\S]*?)\}(?:\s*;)?/s;
    const loopMatch = code.match(loopRegex);

    if (!loopMatch) return null;

    const fullMatchText = loopMatch[0];
    const { initializer, loopBody } = loopMatch.groups;
    let loopWat = [];

    // 1. Parse initializer statement.
    // The initializer variable will be a standard local.
    // We pass a copy of funcDetails because tryParseSimpleStatement might modify localDeclarationsWat.
    const initializerDetails = { ...funcDetails };
    const initResult = tryParseSimpleStatement(initializer, initializerDetails);
    if (!initResult || initResult.wat.length === 0) {
        loopWat.push(`  ;; ERROR: Failed to parse loop initializer: ${initializer}\n`);
        return { wat: loopWat, consumedLength: fullMatchText.length };
    }
    loopWat.push(`  ;; Loop Initializer: ${initializer.trim()}\n`);
    loopWat.push(...initResult.wat);

    // 2. Setup loop labels
    // Generate unique labels for this loop instance to support nested loops.
    // A simple counter or a more robust unique ID generator could be used.
    // For now, just append a generic part of the function name.
    const loopId = `${watFuncName}_loop_${Math.random().toString(36).substring(2, 7)}`;
    const loopExitLabel = `$${loopId}_exit`;
    const loopRepeatLabel = `$${loopId}_repeat`;

    // 3. Create context for the loop body, including the exit label for 'break'
    const loopBodyFuncDetails = {
        ...funcDetails, // Inherit outer context
        currentLoopExitLabel: loopExitLabel // Set for 'break' statements in this loop's body
    };

    loopWat.push(`  (block ${loopExitLabel} ;; Loop exit block\n`);
    loopWat.push(`    (loop ${loopRepeatLabel} ;; Loop repeat block\n`);

    // 4. Parse loop body statements
    const bodyW = parseBodyStatements(loopBody, loopBodyFuncDetails);
    loopWat.push(...bodyW.map(l => `      ${l}`)); // Indent body

    // 5. Add implicit branch to repeat the loop
    loopWat.push(`      (br ${loopRepeatLabel}) ;; Continue loop\n`);
    loopWat.push(`    ) ;; end loop ${loopRepeatLabel}\n`);
    loopWat.push(`  ) ;; end block ${loopExitLabel}\n`);

    return { wat: loopWat, consumedLength: fullMatchText.length };
}

function tryParseTryCatch(code, funcDetails) {
    // Regex to capture try block and the first catch clause.
    // This simplified version only handles one catch block per try.
    // A full implementation would loop to find multiple catch blocks or catch_all.
    const tryCatchRegex = /^\s*try\s*\{(?<tryBody>[\s\S]*?)\}\s*catch\s*\((?<exceptionType>\w+)\s+(?<exceptionVar>\w+)\)\s*\{(?<catchBody>[\s\S]*?)\}(?:\s*;)?/s;
    const match = code.match(tryCatchRegex);

    if (!match || !match.groups) return null;

    const { tryBody, exceptionType, exceptionVar, catchBody } = match.groups;
    const fullMatchText = match[0];
    const { localDeclarationsWat, localVariables, globalInfo, topsTypeToWatType } = funcDetails;

    let tryCatchWat = [];
    tryCatchWat.push(`  ;; try...catch(${exceptionType} ${exceptionVar})\n`);

    // Determine Wasm exception tag and type of caught value
    let wasmExceptionTag;
    let caughtValueWatType = "i32"; // Default for int4 or pointer to Error object

    if (exceptionType === "int4") {
        wasmExceptionTag = `$tops_int4_error_tag`; // Assumed globally defined tag: (tag $tops_int4_error_tag (param i32))
    } else if (globalInfo.classes && globalInfo.classes[exceptionType]) {
        wasmExceptionTag = `$tops_class_${exceptionType}_error_tag`; // Assumed tag: (tag $tops_class_Error_error_tag (param i32)) (i32 is pointer)
    } else {
        tryCatchWat.push(`  ;; ERROR: Unknown exception type '${exceptionType}' in catch block.\n`);
        return { wat: tryCatchWat, consumedLength: fullMatchText.length };
    }

    // The try block might produce a result if returns are inside.
    // For simplicity, assume the function's return type if try-catch is at top level.
    // A more robust solution would analyze returns within try/catch.
    const tryResultType = funcDetails.topsReturnType !== "void" ? `(result ${topsTypeToWatType(funcDetails.topsReturnType)})` : "";

    tryCatchWat.push(`  (try ${tryResultType} ;; Tops try block\n`);
    const tryBodyWat = parseBodyStatements(tryBody, funcDetails);
    tryCatchWat.push(...tryBodyWat.map(l => `    ${l}`));
    tryCatchWat.push(`    (catch ${wasmExceptionTag} ;; Catch Tops ${exceptionType} as ${exceptionVar}\n`);

    // Make the caught value available as 'exceptionVar'
    // The thrown value is on top of the Wasm stack when catch block starts.
    if (!localVariables.has(exceptionVar)) {
        localDeclarationsWat.push(`  (local $${exceptionVar} ${caughtValueWatType}) ;; Caught exception variable\n`);
        localVariables.set(exceptionVar, { watType: caughtValueWatType, topsType: exceptionType, isParam: false });
    }
    tryCatchWat.push(`      (local.set $${exceptionVar}) ;; Store caught value into ${exceptionVar}\n`);

    const catchBodyWat = parseBodyStatements(catchBody, funcDetails);
    tryCatchWat.push(...catchBodyWat.map(l => `      ${l}`));
    tryCatchWat.push(`    )\n`); // end catch
    tryCatchWat.push(`  )\n`);   // end try

    return { wat: tryCatchWat, consumedLength: fullMatchText.length };
}

function tryParseMemberAccess(expression, funcDetails, forStore = false) {
    const { localVariables, memberThis, topsReturnType, localDeclarationsWat, topsTypeToWatType } = funcDetails;

    // This function is designed to parse an expression like "object.property", not a full statement.
    const parts = expression.split('.');
    if (parts.length !== 2) return null; // Only simple a.b access

    const objectName = parts[0];
    const propertyName = parts[1];
    let objectWat = [];
    let classInfo;

    if (objectName === "this") {
        objectWat.push(`  (local.get $this)\n`);
        classInfo = memberThis;
    } else if (localVariables.has(objectName)) {
        objectWat.push(`  (local.get $${objectName})\n`);
        const varInfo = localVariables.get(objectName);
        classInfo = funcDetails.globalInfo.classes && funcDetails.globalInfo.classes[varInfo.topsType];
    } else {
        return null; // Object not found
    }

    if (!classInfo || !classInfo.properties || !classInfo.properties[propertyName]) return null;

    const propInfo = classInfo.properties[propertyName];
    objectWat.push(`  (i32.const ${propInfo.offset})\n`);
    objectWat.push(`  (i32.add)\n`);

    if (!forStore) { // If for loading a value
        // Assuming i32 for simplicity, could use propInfo.type to determine load type
        objectWat.push(`  (i32.load) ;; ${expression}\n`);
    }
    // If forStore is true, the address is on the stack, ready for a value then a store.
    return objectWat;
}

function tryParseSimpleStatement(code, funcDetails, allowComplexExpressions = true) {
    const { localVariables, memberThis, topsReturnType, localDeclarationsWat, topsTypeToWatType } = funcDetails;
    let statementWat = [];
    let consumedLength = 0;

    const trimmedCode = code.trimStart();
    let endOfStatement = trimmedCode.indexOf(';');
    if (endOfStatement === -1) { // Maybe it's the last statement without a semicolon
        endOfStatement = trimmedCode.length;
    }
    if (endOfStatement === 0 && trimmedCode.length > 0) { // Empty statement from ;;
         return { wat: [], consumedLength: code.indexOf(';') + 1 > 0 ? code.indexOf(';') + 1 : code.length};
    }


    const stmt = trimmedCode.substring(0, endOfStatement).trim();
    consumedLength = code.length - (trimmedCode.length - (endOfStatement + 1)); // +1 for semicolon
    if (endOfStatement === trimmedCode.length) consumedLength = code.length; // if no semicolon at end

    if (stmt === "break") {
        if (funcDetails.currentLoopExitLabel) {
            statementWat.push(`  (br ${funcDetails.currentLoopExitLabel}) ;; break\n`);
        } else {
            statementWat.push(`  ;; ERROR: 'break' used outside of a loop.\n`);
        }
    } else
    // Handle 'throw <expression>;' or 'throw new <ClassName>(<arg>);'
    if (stmt.startsWith("throw ")) {
        const throwExpr = stmt.substring("throw ".length).trim();
        const newClassMatch = throwExpr.match(/^new\s+(\w+)\s*\(([^)]*)\)/);

        if (newClassMatch) { // throw new ClassName(arg)
            const className = newClassMatch[1];
            const argExpr = newClassMatch[2].trim();
            // Conceptual: allocate 'new className', initialize with 'argExpr', get its pointer
            statementWat.push(`  ;; Conceptual: new ${className}(${argExpr})\n`);
            statementWat.push(`  (i32.const 0) ;; Placeholder for pointer to new ${className} object\n`);
            // Assume a tag like $tops_class_ClassName_error_tag exists
            statementWat.push(`  (throw $tops_class_${className}_error_tag)\n`);
        } else { // throw <primitive_expression>
            // For now, assume it's a local variable or literal int4
            if (localVariables.has(throwExpr)) {
                statementWat.push(`  (local.get $${throwExpr})\n`);
            } else if (throwExpr.match(/^\d+$/)) {
                statementWat.push(`  (i32.const ${throwExpr})\n`);
            } else {
                statementWat.push(`  ;; Unparsed throw expression: ${throwExpr}\n  (i32.const 0) ;; Placeholder\n`);
            }
            statementWat.push(`  (throw $tops_int4_error_tag)\n`); // Assume a tag for int4 errors
        }
    } else
    if (stmt.startsWith("return ")) {
        if (funcDetails.currentLoopExitLabel) {
            statementWat.push(`  (br ${funcDetails.currentLoopExitLabel}) ;; break\n`);
        } else {
            statementWat.push(`  ;; ERROR: 'break' used outside of a loop.\n`);
        }
    } else
    if (stmt.startsWith("return ")) {
        const returnValueExpr = stmt.substring("return ".length).trim();
        let valuePushed = false;
        if (returnValueExpr) {
            const memberAccessWat = tryParseMemberAccess(returnValueExpr, funcDetails);
            if (memberAccessWat) {
                statementWat.push(...memberAccessWat);
                valuePushed = true;
            } else if (returnValueExpr === "true") {
                statementWat.push(`  (i32.const 1)\n`); valuePushed = true;
            } else if (returnValueExpr === "false") {
                statementWat.push(`  (i32.const 0)\n`); valuePushed = true;
            } else if (localVariables.has(returnValueExpr)) {
                statementWat.push(`  (local.get $${returnValueExpr})\n`); valuePushed = true;
            } else if (returnValueExpr.match(/^\d+$/)) {
                statementWat.push(`  (i32.const ${returnValueExpr})\n`); valuePushed = true; // Assuming i32
            }
             else {
                statementWat.push(`  ;; Unparsed return expr: ${returnValueExpr}\n`);
                if (topsReturnType !== "void") { statementWat.push(`  (i32.const 0) ;; Placeholder\n`); valuePushed = true;}
            }
        }
        if (topsReturnType === "void" && valuePushed) statementWat.push(`  (drop)\n`);
        statementWat.push(`  (return)\n`);
    }
    else if (stmt.match(/^(\w+)\s+(\w+)\s*=\s*(.+)$/)) { // Var declaration: type name = val
        const declMatch = stmt.match(/^(\w+)\s+(\w+)\s*=\s*(.+)$/);
        const varType = declMatch[1];
        const varName = declMatch[2];
        const varValueExpr = declMatch[3].trim();
        const watVarType = topsTypeToWatType(varType);

        if (!localVariables.has(varName)) {
            localDeclarationsWat.push(`  (local $${varName} ${watVarType})\n`);
            localVariables.set(varName, { watType: watVarType, isParam: false });
        }
        // Simplified value parsing
        if (varValueExpr.match(/^\d+$/)) {
            statementWat.push(`  (${watVarType}.const ${varValueExpr})\n`);
        } else if (allowComplexExpressions && varValueExpr.includes('.')) {
            const memberAccessWat = tryParseMemberAccess(varValueExpr, funcDetails);
            if (memberAccessWat) statementWat.push(...memberAccessWat);
            else statementWat.push(`  ;; Unparsed member access: ${varValueExpr}\n  (${watVarType}.const 0)\n`);
        } else if (localVariables.has(varValueExpr)) {
            statementWat.push(`  (local.get $${varValueExpr})\n`);
        }
         else {
            statementWat.push(`  ;; Unparsed var value: ${varValueExpr}\n  (${watVarType}.const 0) ;; Placeholder\n`);
        }
        statementWat.push(`  (local.set $${varName})\n`);
    }
    else if (stmt.match(/^(\w+)\s*=\s*(.+)$/)) { // Assignment: name = val
        const assignMatch = stmt.match(/^(\w+)\s*=\s*(.+)$/);
        const lhsVarName = assignMatch[1];
        const rhsExpr = assignMatch[2].trim();

        let lhsWat = [];
        let isLhsMemberAccess = false;

        if (allowComplexExpressions && lhsVarName.includes('.')) { // LHS is member access e.g. this.dx
            lhsWat = tryParseMemberAccess(lhsVarName, funcDetails, true); // forStore = true
            if (!lhsWat) {
                statementWat.push(`  ;; Unparsed LHS member access: ${lhsVarName}\n`);
                return { wat: statementWat, consumedLength };
            }
            isLhsMemberAccess = true;
            statementWat.push(...lhsWat); // Pushes address for store
        } else if (!localVariables.has(lhsVarName) && !isLhsMemberAccess) {
            statementWat.push(`  ;; Assignment to undeclared var: ${lhsVarName}\n`);
            return { wat: statementWat, consumedLength };
        }

        // Parse RHS
        const plusParts = rhsExpr.split('+').map(p => p.trim());
        if (allowComplexExpressions && plusParts.length === 2) { // Handle "A + B"
            const partA = plusParts[0];
            const partB = plusParts[1];
            let parsedA = false;
            let parsedB = false;

            const memberAccessA = tryParseMemberAccess(partA, funcDetails);
            if (memberAccessA) { statementWat.push(...memberAccessA); parsedA = true; }
            else if (localVariables.has(partA)) { statementWat.push(`  (local.get $${partA})\n`); parsedA = true; }

            const memberAccessB = tryParseMemberAccess(partB, funcDetails);
            if (memberAccessB) { statementWat.push(...memberAccessB); parsedB = true; }
            else if (localVariables.has(partB)) { statementWat.push(`  (local.get $${partB})\n`); parsedB = true; }

            if (parsedA && parsedB) {
                statementWat.push(`  (i32.add)\n`); // Assuming i32.add
            } else {
                statementWat.push(`  ;; Unparsed complex RHS: ${rhsExpr}\n  (i32.const 0) ;; Placeholder\n`);
            }
        } else {
            // Simpler RHS (not an addition)
            const rhsMemberAccessWat = tryParseMemberAccess(rhsExpr, funcDetails);
            if (allowComplexExpressions && rhsMemberAccessWat) {
                statementWat.push(...rhsMemberAccessWat);
            } else if (localVariables.has(rhsExpr)) {
                statementWat.push(`  (local.get $${rhsExpr})\n`);
            } else if (rhsExpr.match(/^\d+$/)) {
                statementWat.push(`  (i32.const ${rhsExpr})\n`);
            } else {
                statementWat.push(`  ;; Unparsed RHS expr: ${rhsExpr}\n  (i32.const 0) ;; Placeholder\n`);
            }
        }

        if (isLhsMemberAccess) {
            statementWat.push(`  (i32.store) ;; ${lhsVarName} = ...\n`);
        } else {
            statementWat.push(`  (local.set $${lhsVarName})\n`);
        }
    }
    else if (stmt) { // Non-empty, unrecognized
        statementWat.push(`  ;; Unrecognized simple statement: ${stmt}\n`);
    } else { // Empty statement (just ';')
        consumedLength = code.indexOf(';') + 1; // Consume the semicolon
        if (consumedLength <= 0) consumedLength = code.length; // Should not happen if stmt is empty
        return { wat: [], consumedLength: consumedLength > 0 ? consumedLength : 1 };
    }

    return { wat: statementWat, consumedLength };
}


function parseBodyStatements(codeBlockString, funcDetails) {
    let bodyWat = [];
    let remainingCode = codeBlockString.trim();
    let safetyBreak = 0; // Prevent infinite loops on parsing errors

    while (remainingCode.length > 0 && safetyBreak < 1000) {
        safetyBreak++;
        let consumed = 0;
        let parsedStatement = null;

        // Try parsing different structures, from more complex to simpler
        parsedStatement = tryParseIfElseChain(remainingCode, funcDetails);
        if (parsedStatement) {
            bodyWat.push(...parsedStatement.wat);
            consumed = parsedStatement.consumedLength;
        } else {
            parsedStatement = tryParseEswitch(remainingCode, funcDetails);
            if (parsedStatement) {
                bodyWat.push(...parsedStatement.wat);
                consumed = parsedStatement.consumedLength;
            } else {
                parsedStatement = tryParseLoop(remainingCode, funcDetails);
                if (parsedStatement) {
                    bodyWat.push(...parsedStatement.wat);
                    consumed = parsedStatement.consumedLength;
                } else {
                    parsedStatement = tryParseTryCatch(remainingCode, funcDetails);
                    if (parsedStatement) {
                        bodyWat.push(...parsedStatement.wat);
                        consumed = parsedStatement.consumedLength;
                    } else {
                // Fallback to simple statement (declaration, assignment, return)
                parsedStatement = tryParseSimpleStatement(remainingCode, funcDetails, true);
                if (parsedStatement && parsedStatement.wat.length > 0) {
                    bodyWat.push(...parsedStatement.wat);
                    consumed = parsedStatement.consumedLength;
                } else if (parsedStatement) { // Empty statement like just ';'
                    consumed = parsedStatement.consumedLength;
                }
                }
                }
            }
        }

        if (consumed > 0) {
            remainingCode = remainingCode.substring(consumed).trimStart();
        } else {
            // Could not parse, skip a character or word to avoid infinite loop
            if (remainingCode.length > 0) {
                const skipMatch = remainingCode.match(/^(\s*\w+\s*|\s*.\s*)/); // Skip a word or a char
                const skipLength = skipMatch ? skipMatch[0].length : 1;
                bodyWat.push(`  ;; PARSE ERROR SKIPPING: ${remainingCode.substring(0, skipLength)}\n`);
                remainingCode = remainingCode.substring(skipLength).trimStart();
            }
        }
    }
    if (safetyBreak >= 1000) {
        bodyWat.push("  ;; PARSING SAFETY BREAK TRIGGERED\n");
    }
    return bodyWat;
}


// Example Usage (based on your provided snippets):

const classInfoTry1 = {
    className: "try1",
    properties: {
        _y: { type: "int4", offset: 0 },
        _x: { type: "int4", offset: 4 }
    }
};
const topsFunc1_corrected = `int4 try1_get_x(this) { return this._x; }`;
console.log("--- Example 1 ---");
console.log(makeTopsMemberFunction(classInfoTry1, topsFunc1_corrected));


 const classInfoFunc = {
     className: "SomeClass",
     properties: {}
 };
 const topsFunc2 = `
 int4 func(this, int4 x)
  {
    int4 y = 123;
    x = x + y * 3;
    return x;
}`;
 console.log("\n--- Example 2 ---");
 console.log(makeTopsMemberFunction(classInfoFunc, topsFunc2));


const classInfoTest = {
     className: "TestClass",
     properties: {
         colorType: { type: "ColorTypes", offset: 0 },
         value: { type: "int4", offset: 4}
     }
 };
 const globalInfoTest = {
     enums: {
         ColorTypes: { red: 0, green: 1, blue: 2, purple: 3 }
     }
 };
 const topsFunc3 = `
 bool test(this)
 {
    eswitch(colorType)
    {
        case colorType.red:
            return true;
        case colorType.green:
            return true;
        case colorType.blue:
            return false;
        default:
            return false;
    };
}`;
 console.log("\n--- Example 3 (eswitch) ---");
 console.log(makeTopsMemberFunction(classInfoTest, topsFunc3, globalInfoTest));

 const topsFunc4If = `
 int4 testIf(this, int4 input)
 {
    int4 result = 0;
    if (input < 10) {
        result = 1;
    } else if (input < 20) {
        result = 2;
    } else {
        result = 3;
    }
    return result;
 }`;
 console.log("\n--- Example 4 (if-else if-else) ---");
 console.log(makeTopsMemberFunction(classInfoTest, topsFunc4If, globalInfoTest));

 const topsFunc5Nested = `
 int4 testNested(this, int4 a, int4 b) {
    if (a == 1) {
        if (b == 2) {
            return 10;
        } else {
            return 20;
        }
    } else {
        return 30;
    }
    return 0; // Should be unreachable if logic is sound
 }
 `;
 console.log("\n--- Example 5 (Nested If) ---");
 console.log(makeTopsMemberFunction(classInfoTest, topsFunc5Nested, globalInfoTest));

 const topsFunc6Loop = `
 int4 testLoop(this) {
    int4 sum = 0;
    loop(int4 i = 0;)
    {
        sum = sum + i;
        i = i + 1;
        if(i >= 10) break;
    }
    return sum; // Expected sum of 0 through 9 = 45
 }
 `;
 console.log("\n--- Example 6 (Loop) ---");
 console.log(makeTopsMemberFunction(classInfoTest, topsFunc6Loop, globalInfoTest));


 const classInfoPoint = { // Define a simple Point class structure
    className: "Point",
    properties: {
        x: { type: "int4", offset: 0 },
        y: { type: "int4", offset: 4 }
    }
 };

 const classInfoVector = {
    className: "Vector",
    properties: {
        dx: { type: "int4", offset: 0 },
        dy: { type: "int4", offset: 4 }
    },
    // Member functions aren't directly used by makeTopsMemberFunction for *this* class's compilation,
    // but good for context.
    memberFunctions: {
        addPoint: "void addPoint(this, Point p)"
    }
 };

 const topsFunc7ClassArg = `
 void Vector_addPoint(this, Point p) {
    int4 temp_x = p.x; // Demonstrates accessing member of class argument
    this.dx = this.dx + temp_x;
 }
 `;
 console.log("\n--- Example 7 (Class as Argument) ---");
 const globalInfoForClasses = {
    enums: globalInfoTest.enums,
    classes: {
        "Point": classInfoPoint,
        "Vector": classInfoVector
    }
 };
 console.log(makeTopsMemberFunction(classInfoVector, topsFunc7ClassArg, globalInfoForClasses));


 const classInfoError = { // Conceptual Error class
    className: "Error",
    properties: {
        code: { type: "int4", offset: 0 }
    }
 };

 const classInfoHandler = { // A class to hold our error handling methods
    className: "ErrorHandler",
    properties: {},
    memberFunctions: {
        throwIntError: "void throwIntError(this, int4 errorCode)",
        throwClassError: "void throwClassError(this, int4 errorCode)",
        handleErrors: "int4 handleErrors(this)"
    }
 };

 const globalInfoForErrorHandling = {
    enums: {},
    classes: {
        "Error": classInfoError, // Defined in previous examples
        "ErrorHandler": classInfoHandler
    }
 };

 // Conceptual functions that "throw". We don't compile these directly here.
 // Their compilation would involve Wasm 'throw' instructions.
 const topsFunc_throwIntError = `
 void ErrorHandler_throwIntError(this, int4 errorCode) {
    throw errorCode; // Now using the defined 'throw' syntax
 }
 `;
 const topsFunc_throwClassError = `
 void ErrorHandler_throwClassError(this, int4 errorCode) {
    throw new Error(errorCode); // Now using the defined 'throw new' syntax
 }
 `;

 const topsFunc_handleErrors = `
 int4 ErrorHandler_handleErrors(this) {
    int4 resultCode = 0;
    try {
        this.throwIntError(404); // Call function that "throws" an int4
        resultCode = 1; // Should not be reached if error is thrown
    } catch (int4 e_int) {
        resultCode = e_int; // e_int should be 404
    }

    try {
        this.throwClassError(500); // Call function that "throws" an Error object
    } catch (Error e_class) {
        resultCode = resultCode + e_class.code; // e_class.code should be 500
    }
    return resultCode; // Expected: 404 or 404 + 500 = 904 if second throw happens after first catch
 }
 `;
 console.log("\n--- Example 8 (Try-Catch for int4 and Class Error) ---");
 // We need to compile all functions that are called if we want to see their WAT.
 // For this example, we'll still focus on compiling `handleErrors`.
 // The `throwIntError` and `throwClassError` would need to be compiled separately
 // for their 'throw' statements to be fully realized in WAT.
 // The `makeTopsMemberFunction` currently compiles one function string at a time.
 console.log(makeTopsMemberFunction(classInfoHandler, topsFunc_handleErrors, globalInfoForErrorHandling));
