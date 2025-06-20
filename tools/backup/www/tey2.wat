(module
  ;; Import a shared memory from the "env" module
  ;; It must specify both initial and maximum pages for shared memory.
  ;; The 'shared' keyword indicates it's a shared memory.
  (import "env" "memory" (memory $shared_mem 10 20 shared))

  ;; You can then access this shared memory using standard memory instructions
  ;; For example, a function to read from the shared memory
  (func (export "readSharedValue") (param $offset i32) (result i32)
    local.get $offset
    i32.load ($shared_mem) ;; Load a 32-bit integer from the shared memory at the given offset
  )

  ;; Or a function to write to the shared memory
  (func (export "writeSharedValue") (param $offset i32) (param $value i32)
    local.get $offset
    local.get $value
    i32.store ($shared_mem) ;; Store a 32-bit integer into the shared memory
  )

  ;; (Optional) Example of using atomic operations, which are often used with shared memory
  ;; This requires the 'atomics' feature to be enabled in your Wasm engine/compiler
  ;; (module
  ;;   (import "env" "memory" (memory 10 20 shared))
  ;;   (func (export "atomicAdd") (param $offset i32) (param $delta i32) (result i32)
  ;;     local.get $offset
  ;;     local.get $delta
  ;;     i32.atomic.rmw.add ($shared_mem)
  ;;   )
  ;; )
)







(module
  ;; 1. Define a memory segment
  ;;    This memory will hold your string constants.
  (memory (export "memory") 1) ; Export memory so JavaScript can access it

  ;; 2. Define data segments for your C-style strings
  ;;    Each `data` segment specifies a starting memory offset and the bytes to store.
  ;;    Crucially, you must explicitly include the null terminator (`\0`)
  ;;    at the end of your string literal to make it a C-style string.

  ;; String 1: "Hello, WebAssembly!\0" starting at byte offset 0
  (data (i32.const 0) "Hello, WebAssembly!\0")

  ;; String 2: "This is a C-string constant.\0" starting at byte offset 20
  ;; (Ensure enough space after the previous string)
  (data (i32.const 20) "This is a C-string constant.\0")

  ;; String 3: Demonstrating escaped characters and null termination
  ;; "New Line!\nAnd Tab!\tNull.\0" starting at byte offset 50
  (data (i32.const 50) "New Line!\\nAnd Tab!\\tNull.\\0")

  ;; 3. Exported functions to get the pointers (addresses) and lengths of these strings
  ;;    You typically return the starting address of the string. The length is often
  ;;    derived in JavaScript by finding the null terminator, or you can explicitly
  ;;    return the length as well.

  (func (export "getHelloStringInfo") (result i32 i32)
    i32.const 0   ;; Pointer to "Hello, WebAssembly!\0"
    i32.const 19  ;; Length (19 characters, excluding the null terminator)
  )

  (func (export "getCStringConstantInfo") (result i32 i32)
    i32.const 20  ;; Pointer to "This is a C-string constant.\0"
    i32.const 28  ;; Length (28 characters)
  )

  (func (export "getEscapedStringInfo") (result i32 i32)
    i32.const 50  ;; Pointer to "New Line!\nAnd Tab!\tNull.\0"
    i32.const 25  ;; Length (25 characters including \n, \t, but excluding \0)
  )
)

========
(module
  ;; 1. Import a memory segment from the "env" namespace
  ;;    This module doesn't create its own memory; it relies on the host to provide it.
  (import "env" "memory" (memory $imported_mem 1 1)) ; min 1 page, max 1 page (fixed size)

  ;; 2. Define data segments that will initialize this *imported* memory
  ;;    The memory index (0, by default, as only one memory is currently standard)
  ;;    is implicitly used for the data segment.
  ;;    The offsets are relative to the start of the imported memory.

  ;; String 1: "Hello from imported memory!\0" starting at byte offset 0
  (data (i32.const 0) "Hello from imported memory!\0")

  ;; Some integer data starting at byte offset 30
  ;; (Using "\xx" for raw bytes to demonstrate)
  (data (i32.const 30) "\01\00\00\00\02\00\00\00") ; Two i32s: 1 and 2

  ;; 3. Exported functions to read from this memory
  (func (export "getStringPointer") (result i32)
    i32.const 0  ;; Return pointer to the string
  )

  (func (export "getI32Value") (param $index i32) (result i32)
    local.get $index
    i32.const 30 ;; Base address for integer data
    i32.add      ;; Calculate actual byte offset
    i32.load     ;; Load a 32-bit integer
  )
)
//////

(module
  ;; Define and export memory so JavaScript can interact with it
  (memory (export "memory") 1) ; 1 page = 64KB

  ;; A function to set (write) a string into memory
  ;; This function takes:
  ;; - $ptr: The starting byte offset in memory where the string should be written.
  ;; - $char_code: The ASCII/UTF-8 code of the character to write.
  ;; - $index: The offset from the $ptr where the character should be placed.
  ;; For simplicity, this example writes one character at a time.
  ;; Real-world scenarios often involve copying larger blocks or using helper functions.
  (func (export "setCharInString") (param $ptr i32) (param $char_code i32) (param $index i32)
    local.get $ptr        ;; Get the base pointer
    local.get $index      ;; Get the index within the string
    i32.add               ;; Calculate the effective byte offset (ptr + index)
    local.get $char_code  ;; Get the character code (as an i32, then store its byte)
    i32.store8            ;; Store the single byte at the calculated offset
  )

  ;; A function to null-terminate a string at a given offset
  (func (export "nullTerminate") (param $ptr i32)
    local.get $ptr
    i32.const 0           ;; Push the null byte (0)
    i32.store8            ;; Store it at the given pointer
  )

  ;; A simplified example to write "WASM" and null-terminate it
  ;; starting at byte offset 100
  (func (export "writeExampleString")
    i32.const 100        ;; Base pointer for our string
    i32.const 87         ;; ASCII 'W'
    i32.const 0          ;; Index 0
    call $setCharInString

    i32.const 100        ;; Base pointer
    i32.const 65         ;; ASCII 'A'
    i32.const 1          ;; Index 1
    call $setCharInString

    i32.const 100        ;; Base pointer
    i32.const 83         ;; ASCII 'S'
    i32.const 2          ;; Index 2
    call $setCharInString

    i32.const 100        ;; Base pointer
    i32.const 77         ;; ASCII 'M'
    i32.const 3          ;; Index 3
    call $setCharInString

    i32.const 100        ;; Base pointer for null termination
    i32.const 4          ;; Offset for null (after 'M')
    i32.add              ;; Calculate (100 + 4) = 104
    call $nullTerminate  ;; Null-terminate at byte offset 104
  )
)

==========
(module
  (func $finc (param $i i32) (result i32)
    
    get_local $i    ;; Push the value of parameter i onto the stack
    i32.const 123   ;; Push the constant 123 onto the stack
    i32.mul         ;; Multiply the top two values (i * 123) and push the result
	
    i32.const 2     ;; Push the constant 2 onto the stack
    i32.add         ;; Add the top two values ((i * 123) + 2) and push the result

    
)


int func(int i)
{
	int a= 123;
	i=i*a;
	a= i+54;
	i=i+a;
	return i;
	
}
convert to wat

(module
  (func $func (param $i i32) (local $a i32) (result i32)
    ;; int a = 123;
    i32.const 123
    local.set $a

    ;; i = i * a;
    local.get $i
    local.get $a
    i32.mul
    local.set $i

    ;; a = i + 54;
    local.get $i
    i32.const 54
    i32.add
    local.set $a

    ;; i = i + a;
    local.get $i
    local.get $a
    i32.add
    local.set $i

    ;; return i;
    local.get $i
  )

  ;; (export "func" (func $func)) ;; Optional: Export the function to be callable from outside
)



async? from host
(module
  (import "env" "fetch_data" (func $fetch_data (param i32 i32 i32) (result i32))) ;; Example: (url_ptr, url_len, callback_func_idx) -> request_id

  (func $my_wasm_logic (param $url_ptr i32) (param $url_len i32) (result i32)
    ;; ... some logic ...
    local.get $url_ptr
    local.get $url_len
    i32.const $on_data_received_callback_idx ;; A function index to call when data arrives
    call $fetch_data ;; This calls out to JavaScript, which initiates an async operation
    ;; ... execution continues immediately in Wasm, but the data isn't ready yet ...
    i32.const 0 ;; Return a placeholder or request ID
  )

  (func $on_data_received_callback (param $request_id i32) (param $data_ptr i32) (param $data_len i32)
    ;; This function is called by JavaScript when the data arrives
    ;; ... process the data ...
  )
)

(module
  (memory (export "memory") 1 100 shared) ;; Shared memory
  (import "env" "spawn_worker" (func $spawn_worker (param i32))) ;; JS function to spawn a worker

  (func $main_thread_entry
    ;; ... do some work ...
    i32.const $worker_entry_point_idx
    call $spawn_worker ;; Spawns a new Web Worker running another Wasm instance
    ;; ... continue on main thread ...
  )

  (func $worker_entry_point (param $id i32)
    ;; This function runs in a separate Web Worker thread
    ;; ... access shared memory, use atomics for synchronization ...
  )
)

