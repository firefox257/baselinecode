


var v={
	
	x:123,
	fun:function() {
		var self=this;
		console.log(`here:${self.x}`);
	}
}

var vv=v.fun.bind(v);

vv();





/*
var outerror =console.error.bind(console);

console.log =()function()
{
	outerror("blabla");
	console.log("================");
	outerror(...arguments);
	
	
}).bind(console);
*/

try
{
	
	
eval("hdhd");
}
catch(err)
{
	console.log("Error:", err.message, err)
}
