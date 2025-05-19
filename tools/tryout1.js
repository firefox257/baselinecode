require('./globals.js')



function prop(p, o) {
	
	var v = o.values
	var e = o.events
	
	for(var i in e) {
		p["_"+i+"Calls"]=[]
		new Function(["p"],`
		
		
		
		
		p.${i} = function() {
			var a= this._${i}Calls
			var l= a.length
			for(var i= 0;i<l;i++) {
				a[i](...arguments)
			}
			
		}
		
		p.${i}Add = function(func) {
			this._${i}Calls.push(func)
		}
		
		
		`)(p)
	}
	//*/
	
	
	
	for(var i in v) {
		p['_'+i]= v[i]
		
		
		var eventcalls=[]
		
		for(var ii in e) {
			eventcalls.push(`this.${ii}("${i}",v)`)
		}
		
		new Function(["p"], `
		
		
		defineProp(p, "${i}", {
			get() {
				return this._${i}
			},
			set(v) {
				this._${i} = v
				${eventcalls.join("\r\n")}
			}
		})
		
		
		`)(p)
	}
	//*/
	
	
	
}


function eventBus(p, o) {
	
	
	for(var i in o) {
		
		new Function(["p","i"], `
		
		p._${i}Calls=[]
		p.${i}=function() {
			var a=this._${i}Calls
			var l=a.length
			for(var ii= 0;ii<l;ii++) {
				a[ii](...arguments)
			}
			
		}
		p.${i}Add=function(func) {
			p._${i}Calls.push(func)
		}
		
		`)(p,i)
	}
	
}


var B =mclass({
	
	
	templates:(p)=>{

		
		prop(p, {
			values:{
				width:null,
				height:null,
				size(v) {
					if(v==undefined) {
						return [this._width, this._height]
					}
				}
				
			},//end values
			events:{
				onSizeChange:true,
				onPropsChange:true
			}
		})
		eventBus(p,{
			onClick:true
		})
		
	},
	prototype:{
		init() {
			
		}
		
	}
	
})


var b= new B()
b.onPropsChangeAdd((i,v)=>{
	console.log(i+" "+v)
	
})
b.width=3