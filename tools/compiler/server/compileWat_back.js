/*
The code below takes a webassembly wat code as a string and creates a binary.
in the end of the complieWat stream write out the file in the wasm directory with the given file name.
*/


const wabtModule = require('wabt')

var wabt

async function compileWat (filename, code) {
    if (wabt == undefined) {
        wabt = await wabtModule()
    }
    module = wabt.parseWat(filename, code)
    console.log('WAT parsed successfully.')

    // Resolve names and check for errors
    module.resolveNames()
    module.validate()
    console.log('Module validated.')
    // Get the binary representation
    const { buffer, log } = module.toBinary({
        log: true,
        write_debug_names: false
    })
    //if (log) {
        //console.log('Conversion log:', log)
    //}

    // The 'buffer' is a Uint8Array containing the Wasm binary
    //console.log('Wasm Binary (Uint8Array):', buffer)
    console.log('Binary size:', buffer.length, 'bytes')
}


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
compileWat("try1.wasm",myWat);

module.compileWat=compileWat;