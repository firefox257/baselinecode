const code = `


try
{
	 function innerFunction() {
    
    throw new Error('Something went wrong!'); // Error occurs here
	}
	
	innerFunction();
	
	
}
catch(e) {
	console.error("line:"+e.lineno)
	console.error(e.stack);
	//console.log(e.message);
	
}

  
  
  
  
//# sourceURL=bla-this-title.js
  `;

try {
  // Create and execute the function
  const dynamicFunc = new Function(code);
  dynamicFunc();
} catch (e) {
  // The stack trace will now refer to 'my-dynamic-script.js'
  console.error(e.stack);
}
