






eval(`
try
{
	async function runthis()
	{
		try
		{
			
			
			printlog(1);
		}
		catch(e)
		{
			console.log(e.message);
			console.log(e.stack);
		}
	}
	runthis()
}
catch(e)
{
	console.log(e.message);
	console.log(e.stack);
}


//# sourceURL=bla-this-title.js
`)