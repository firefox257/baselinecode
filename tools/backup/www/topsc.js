



var typeSize= {
	bool:1,
	int1:1,
	int2:2,
	int4:4,
	int8:8,
	uint1:1,
	uint2:2,
	uint4:4,
	uint8:8,
	float4:4,
	float8:8,
	ptr:8,
	
}



class topsClass{
	className="";
	orderNames=[];
	types={};
	_atoffset=0;
	constructor(){
		
		
	}
	addProperty(name, typeName){
		
		var self= this;
		if(types[name]!==undefined) {
			throw new Error(`${name} is already defined`);
		}
		
		var s = typeSize[name];
		var node={
			name:name,
			type:typeName,
			offset: self._atoffset,
			size: s
		}
		self.orderNames.push(node);
		
		types[name]= node;
		self._atoffset+=s;
		//*/
	}
	
};

class topsc {
	groups={}
	classes={}
	constructor(){
		
	}
	
};


console.log("done")



