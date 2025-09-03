

var v1 ={
	
	i:0
}
class try1
{
	
	constructor(){
		this.i=123;
		this.v=v1;
	}
	
	geti()
	{
		return this.v.i;
	}
	getfunc()
	{
		var self =this;
		return ()=>{
			return self.geti();
		}
	}
	
}



var t1= new try1();

var geti=t1.getfunc();
console.log(geti());
v1.i=124;

console.log(geti());


//*/
