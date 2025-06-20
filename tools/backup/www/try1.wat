(module
  (import "env" "print" (func $hostPrint (param i32)))
  
  (func (export "add") $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )

  (func (export "calculateAndPrint") $calculateAndPrint (param $x i32) (param $y i32)
    local.get $x
    local.get $y
    call $add 
    call $hostPrint
  )
)
