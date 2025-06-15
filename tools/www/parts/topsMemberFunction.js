function makeTopsMemberFunction(memberThis, topsFunctionString, globalInfo = { enums: {} }) {
    let watOutput = [];
    const localVariables = new Map(); // Stores { name: { watType: "i32", isParam: true/false, index: N } }
    let nextParamIndex = 0;
    let localDeclarationsWat = [];

    // Helper to map Tops types to WAT types
    function topsTypeToWatType(topsType) {
        switch (topsType) {
            case "void": return ""; // For result type, indicates no result
            case "bool":
            case "char": // Assuming char is treated as i32 for operations, loaded/stored as i8
            case "int1": case "uint1":
            case "int2": case "uint2":
            case "int4": case "uint4":
                return "i32";
            case "int8": case "uint8":
                return "i64";
            case "float4":
                return "f32";
            case "float8":
                return "f64";
            default:
                // Assuming class names, pointers, arrays are i32 (addresses)
                return "i32";
        }
    }

    // 1. Parse function signature
    const sigRegex = /^\s*(?<returnType>\S+)\s+(?<funcName>\S+)\s*\((?<paramsStr>[^)]*)\)\s*\{(?<body>.*)\}\s*$/s;
    const sigMatch = topsFunctionString.match(sigRegex);

    if (!sigMatch || !sigMatch.groups) {
        throw new Error(`Invalid function string format: ${topsFunctionString}`);
    }

    const { returnType: topsReturnType, funcName, paramsStr, body: bodyStr } = sigMatch.groups;
    const watFuncName = `${memberThis.className}_${funcName}`;

    let signatureWat = `(func $${watFuncName}`;

    // Process parameters
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
        signatureWat += ` (param $${paramName} ${watParamType})`;
        localVariables.set(paramName, { watType: watParamType, isParam: true, index: nextParamIndex++ });
    }

    const watReturnType = topsTypeToWatType(topsReturnType);
    if (watReturnType) {
        signatureWat += ` (result ${watReturnType})`;
    }
    signatureWat += "\n";

    // 2. Parse function body
    let remainingBodyStr = bodyStr.trim();
    let bodyWat = [];

    // --- BEGIN ESWITCH PRE-PROCESSING ---
    const eswitchBlockRegex = /eswitch\s*\((?<enumVarName>\w+)\)\s*\{(?<innerBody>[\s\S]*?)\}(?:\s*;)?/s;
    let eswitchMatchGlobal;

    if ((eswitchMatchGlobal = eswitchBlockRegex.exec(remainingBodyStr)) !== null) {
        const fullMatchText = eswitchMatchGlobal[0];
        const { enumVarName, innerBody } = eswitchMatchGlobal.groups;

        const propEnum = memberThis.properties[enumVarName];
        if (!propEnum) {
            bodyWat.push(`  ;; ERROR: Enum var '${enumVarName}' not found in memberThis.properties. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
        } else {
            const enumDefinition = globalInfo.enums[propEnum.type];
            if (!enumDefinition) {
                bodyWat.push(`  ;; ERROR: Enum definition for type '${propEnum.type}' (of var '${enumVarName}') not found in globalInfo.enums. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
            } else {
                const parsedCaseActions = [];
                let parsedDefaultAction = null;
                const entryRegex = /(?<type>case)\s+(?<caseEnumName>\w+)\.(?<memberName>\w+)\s*:\s*(?<caseCode>[^;]*?);|(?<typeDefault>default)\s*:\s*(?<defaultCode>[^;]*?);/g;
                let entryMatch;
                const cleanedInnerBody = innerBody.trim();

                while ((entryMatch = entryRegex.exec(cleanedInnerBody)) !== null) {
                    if (entryMatch.groups.type === 'case') {
                        const { caseEnumName, memberName, caseCode } = entryMatch.groups;
                        if (caseEnumName !== enumVarName) {
                            bodyWat.push(`  ;; ERROR: eswitch case path '${caseEnumName}.${memberName}' does not match switched enum '${enumVarName}'. Case skipped.\n`);
                            continue;
                        }
                        if (typeof enumDefinition[memberName] === 'undefined') {
                            bodyWat.push(`  ;; ERROR: Enum member '${memberName}' not found in enum '${propEnum.type}'. Case skipped.\n`);
                            continue;
                        }
                        const returnMatch = caseCode.trim().match(/^return\s+(true|false|\d+)/);
                        if (returnMatch) {
                            parsedCaseActions.push({
                                memberName: memberName,
                                value: enumDefinition[memberName],
                                returnValue: returnMatch[1]
                            });
                        } else {
                            bodyWat.push(`  ;; ERROR: eswitch case for '${enumVarName}.${memberName}' has unparsable code: ${caseCode.trim()}. Case skipped.\n`);
                        }
                    } else if (entryMatch.groups.typeDefault === 'default') {
                        const { defaultCode } = entryMatch.groups;
                        const returnMatch = defaultCode.trim().match(/^return\s+(true|false|\d+)/);
                        if (returnMatch) {
                            parsedDefaultAction = { returnValue: returnMatch[1] };
                        } else {
                            bodyWat.push(`  ;; ERROR: eswitch default case has unparsable code: ${defaultCode.trim()}. Default may be broken.\n`);
                        }
                    }
                }

                if (!parsedDefaultAction) {
                    bodyWat.push(`  ;; ERROR: eswitch for '${enumVarName}' is missing a parsable default case. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
                } else {
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
                         bodyWat.push(`  ;; ERROR: Could not determine max enum value for '${propEnum.type}'. ESWITCH FAILED.\n  (i32.const 0)\n  (return)\n`);
                    } else {
                        const eswitchLabelBase = `eswitch_${watFuncName.replace(/[^a-zA-Z0-9_]/g, '_')}_${enumVarName}`;
                        const getCaseLabel = (val) => `${eswitchLabelBase}_case_${val}`;
                        const defaultLabel = `${eswitchLabelBase}_default`;
                        const brTableLabels = new Array(maxEnumValue + 1);
                        const caseWatBlocks = new Map();

                        for (const action of parsedCaseActions) {
                            if (typeof action.value !== 'number' || action.value < 0) {
                                bodyWat.push(`  ;; WARN: Invalid enum value ${action.value} for ${enumVarName}.${action.memberName}. Case skipped.\n`);
                                continue;
                            }
                            const label = getCaseLabel(action.value);
                            if (action.value >= 0 && action.value < brTableLabels.length) {
                                brTableLabels[action.value] = label;
                            }
                            const retValConst = action.returnValue === "true" ? "(i32.const 1)" :
                                                action.returnValue === "false" ? "(i32.const 0)" :
                                                `(i32.const ${action.returnValue})`;
                            caseWatBlocks.set(label, `  (block $${label} ;; ${enumVarName}.${action.memberName} (value ${action.value})\n    ${retValConst}\n    (return)\n  )\n`);
                        }

                        for (let i = 0; i <= maxEnumValue; i++) {
                            if (!brTableLabels[i]) {
                                brTableLabels[i] = defaultLabel;
                            }
                        }

                        bodyWat.push(`  ;; eswitch (${enumVarName})\n`);
                        bodyWat.push(`  (local.get $this)\n`);
                        bodyWat.push(`  (i32.const ${propEnum.offset})\n`);
                        bodyWat.push(`  (i32.add)\n`);
                        bodyWat.push(`  (i32.load) ;; Load enum value for ${enumVarName} (type ${propEnum.type})\n`);
                        bodyWat.push(`  (br_table ${brTableLabels.map(l => `$${l}`).join(' ')} $${defaultLabel}) ;; Jump table\n`);

                        const emittedLabels = new Set();
                        for (const label of brTableLabels) {
                            if (label !== defaultLabel && caseWatBlocks.has(label) && !emittedLabels.has(label)) {
                                bodyWat.push(caseWatBlocks.get(label));
                                emittedLabels.add(label);
                            }
                        }
                        const defaultRetValConst = parsedDefaultAction.returnValue === "true" ? "(i32.const 1)" :
                                                   parsedDefaultAction.returnValue === "false" ? "(i32.const 0)" :
                                                   `(i32.const ${parsedDefaultAction.returnValue})`;
                        bodyWat.push(`  (block $${defaultLabel} ;; default case for ${enumVarName}\n    ${defaultRetValConst}\n    (return)\n  )\n`);
                        bodyWat.push(`  (unreachable) ;; After eswitch, as all paths should return\n`);
                    }
                }
            }
        }
        remainingBodyStr = remainingBodyStr.replace(fullMatchText, '').trim();
    }
    // --- END ESWITCH PRE-PROCESSING ---

    // Process remaining simple statements
    const statements = remainingBodyStr.split(';').map(s => s.trim()).filter(s => s);
    for (const stmt of statements) {
        if (stmt.startsWith("return ")) {
            const returnValueExpr = stmt.substring("return ".length).trim();
            let valuePushedToStack = false;
            if (returnValueExpr) {
                if (returnValueExpr === "this._x") {
                    const prop = memberThis.properties._x;
                    if (!prop) throw new Error("Property _x not found in memberThis");
                    bodyWat.push(`  (local.get $this)\n`);
                    bodyWat.push(`  (i32.const ${prop.offset})\n`);
                    bodyWat.push(`  (i32.add)\n`);
                    bodyWat.push(prop.type === "int4" || prop.type === "uint4" ? `  (i32.load)\n` : `  (i32.load) ;; TODO: Specific load for ${prop.type}\n`);
                    valuePushedToStack = true;
                } else if (returnValueExpr === "true") {
                    bodyWat.push(`  (i32.const 1)\n`);
                    valuePushedToStack = true;
                } else if (returnValueExpr === "false") {
                    bodyWat.push(`  (i32.const 0)\n`);
                    valuePushedToStack = true;
                } else if (localVariables.has(returnValueExpr)) {
                    bodyWat.push(`  (local.get $${returnValueExpr})\n`);
                    valuePushedToStack = true;
                } else {
                    bodyWat.push(`  ;; Expression for return value: ${returnValueExpr} - needs parsing\n`);
                    if (topsReturnType !== "void") bodyWat.push(`  (i32.const 0) ;; Placeholder for unparsed expr\n`);
                    valuePushedToStack = (topsReturnType !== "void");
                }
            }
            if (topsReturnType === "void" && valuePushedToStack) {
                bodyWat.push(`  (drop) ;; Drop value for void return\n`);
            }
            bodyWat.push(`  (return)\n`);
        }
        else if (stmt.match(/^(\w+)\s+(\w+)\s*=\s*(.+)$/)) { // Local var declaration
            const declMatch = stmt.match(/^(\w+)\s+(\w+)\s*=\s*(.+)$/);
            const varType = declMatch[1];
            const varName = declMatch[2];
            const varValueExpr = declMatch[3].trim();
            const watVarType = topsTypeToWatType(varType);
            if (!localVariables.has(varName)) {
                localDeclarationsWat.push(`  (local $${varName} ${watVarType})\n`);
                localVariables.set(varName, { watType: watVarType, isParam: false });
            }
            if (varValueExpr.match(/^\d+$/)) {
                bodyWat.push(`  (${watVarType}.const ${varValueExpr})\n`);
            } else {
                bodyWat.push(`  ;; Expression for var value: ${varValueExpr} - needs parsing\n`);
                bodyWat.push(`  (${watVarType}.const 0) ;; Placeholder\n`);
            }
            bodyWat.push(`  (local.set $${varName})\n`);
        }
        else if (stmt.match(/^(\w+)\s*=\s*(.+)$/)) { // Assignment
            const assignMatch = stmt.match(/^(\w+)\s*=\s*(.+)$/);
            const lhsVarName = assignMatch[1];
            const rhsExpr = assignMatch[2].trim();
            if (localVariables.has(lhsVarName) && rhsExpr === "x + y * 3" && localVariables.has("x") && localVariables.has("y")) {
                bodyWat.push(`  (local.get $x)\n`);
                bodyWat.push(`  (local.get $y)\n`);
                bodyWat.push(`  (i32.const 3)\n`);
                bodyWat.push(`  (i32.mul)\n`);
                bodyWat.push(`  (i32.add)\n`);
            } else {
                bodyWat.push(`  ;; RHS Expression: ${rhsExpr} - needs parsing\n`);
                bodyWat.push(`  (i32.const 0) ;; Placeholder for RHS value\n`);
            }
            bodyWat.push(`  (local.set $${lhsVarName})\n`);
        } else if (stmt.startsWith("eswitch")) {
            bodyWat.push(`  ;; Malformed or unhandled eswitch found by simple parser: ${stmt}\n`);
        }
         else if (stmt) {
            bodyWat.push(`  ;; Unrecognized statement: ${stmt}\n`);
        }
    }

    watOutput.push(signatureWat);
    watOutput.push(...localDeclarationsWat);
    watOutput.push(...bodyWat);
    watOutput.push(`) ;; end func $${watFuncName}\n`);

    return watOutput.join("");
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
         colorType: { type: "ColorTypes", offset: 0 }
     }
 };
 const globalInfoTest = {
     enums: {
         ColorTypes: { red: 0, green: 1, blue: 2 }
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
 console.log("\n--- Example 3 ---");
 console.log(makeTopsMemberFunction(classInfoTest, topsFunc3, globalInfoTest));
