const WabtModule=require("./libwabt.js");

console.log("here");

// Example WAT string (a simple function that adds two i32 numbers)
/*      
		const myWat = `
(module
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add)
  (export "add" (func $add))
)
`;*/


const myWat = `
(module
  (import "env" "print" (func $hostPrint (param i32)))
  
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )
  (export "add" (func $add))

  (func $calculateAndPrint (param $x i32) (param $y i32) 
  
    local.get $x
    local.get $y
    call $add 
    call $hostPrint
  )
  (export "calculateAndPrint" (func $calculateAndPrint) )
)
`

async function convertWatToWasm(wabt, watString) {
    let module // Declare module here to access it in finally
    try {
        module = wabt.parseWat('add.wat', watString)
        console.log('WAT parsed successfully.')

        // Resolve names and check for errors
        module.resolveNames()
        module.validate()
        console.log('Module validated.')
        // Get the binary representation
        const { buffer, log } = module.toBinary({
            log: true,
            write_debug_names: true
        })

        if (log) {
            console.log('Conversion log:', log)
        }

        // The 'buffer' is a Uint8Array containing the Wasm binary
        console.log('Wasm Binary (Uint8Array):', buffer)
        console.log('Binary size:', buffer.length, 'bytes')

        return buffer
    } catch (e) {
        console.error('Error during WAT to Wasm conversion:', e)
        return null
    } finally {
        // Clean up the module if it exists
        if (module) {
            module.destroy()
            console.log('WABT module destroyed.')
        }
    }
}

// WabtModule is loaded globally by wabt.js
WabtModule()
    .then((wabt) => {
        console.log('WABT Module loaded.')
        statusDisplay.textContent = 'WABT loaded. Starting conversion...'

        convertWatToWasm(wabt, myWat).then((wasmBinary) => {
            if (wasmBinary) {
                console.log(
                    'Conversion process finished successfully in HTML page.'
                )
                // Example of how to instantiate and use the Wasm module

                var env = {
                    env: {
                        print: print
                    }
                }

                WebAssembly.instantiate(wasmBinary, env)
                    .then((result) => {
                        console.log(
                            'Instantiated Wasm module exports:',
                            result.instance.exports
                        )
                        const sum = result.instance.exports.add(15, 27)

                        result.instance.exports.calculateAndPrint(15, 27)
                        console.log('15 + 27 =', sum) // Output: 42
                        statusDisplay.textContent = `Conversion successful! Test: 15 + 27 = ${sum}`
                    })
                    .catch((err) => {
                        console.error('Error instantiating Wasm module:', err)
                        statusDisplay.textContent = `Conversion successful, but instantiation failed: ${err.message}`
                    })
            } else {
                console.log('Conversion process failed in HTML page.')
                statusDisplay.textContent =
                    'Conversion failed. Check console for errors.'
            }
        })
    })
    .catch((err) => {
        console.error('Failed to load WabtModule:', err)
        statusDisplay.textContent = 'Failed to load WABT. Check console.'
        wasmOutputDisplay.textContent = 'WABT loading failed.'
    })

	
	
	
	//*/