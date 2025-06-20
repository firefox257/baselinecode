
//////////////
globalThis.defineProp = Object.defineProperty



globalThis.getAllKeys = function (source, ignore) {
    var stringKeys = Object.getOwnPropertyNames(source)
    var symbolKeys = Object.getOwnPropertySymbols(source)
    var allKeys = [...stringKeys, ...symbolKeys]

    var retKeys = {}
    var l = allKeys.length
    for (var i = 0; i < l; i++) {
        var key = allKeys[i]
        if (!ignore[key]) {
            retKeys[key] = true
        }
    }
    return retKeys
}

const deepSet = function (allKeys, target, source, expandable) {
    expandable = expandable ? expandable : {}
    for (var key in allKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(source, key)
        // If a descriptor exists (which it should for own properties), define the property on the copy
        if (descriptor) {
            if (expandable[key] && target[key] !== undefined) {
                var tobj = target[key]
                var sobj = source[key]
                var ttype = typeof tobj
                var stype = typeof sobj
                var ista = Array.isArray(tobj)
                var issa = Array.isArray(sobj)

                if (ttype != 'object' || stype != 'object' || ista != issa) {
                    throw new Error(
                        `${key} target and source need to be the same type of array or object`
                    )
                }

                if (ista) {
                    var l = sobj.length
                    for (var i = 0; i < l; i++) {
                        tobj.push(sobj[i])
                    }
                } else {
                    var ak = getAllKeys(sobj, {})
                    deepSet(ak, target[key], source[key])
                }
            } else {
                if (typeof source[key] == 'object') {
                    //console.log("here1:"+key)
                    //console.log(source[key])
                    target[key] = deepClone(source[key])
                    //console.log(target[key])
                } else {
                    Object.defineProperty(target, key, descriptor)
                }
            }
        }
    }
}

globalThis.expandObject = function (traget, source) {
    var allKeys = getAllKeys(source, {})
    deepSet(allKeys, target, source, {})
}

/////mclass
const mclassConstructProxy = {
    construct(target, argumentsList, newTarget) {
        var obj = new target()
		//unoptimized set function refs which takes mor memory
		//deepClone(target.prototype) //new target()
        var proxy

        if (target.sources !== undefined) {
            for (var i in target.sources) {
                if (proxy == undefined) proxy = target.sources[i].proxy
                else {
                    throw new Error(
                        'mclass from all the sources can only have one proxy'
                    )
                }
            }
        }
        if (proxy == undefined) proxy = target.proxy
        else {
            throw new Error(
                'mclass from all the sources can only have one proxy'
            )
        }

        if (obj.init !== undefined) obj.init(...argumentsList)

        ////check needed
        for (var i in target.needed) {
            if (obj[i] == undefined) {
                throw new Error(target.needed[i])
            }
        }

        if (proxy !== undefined) {
            var pobj = new Proxy(obj, proxy)
            return pobj
        }
        return obj
    }
}

globalThis.mclass = function (def) {
    var dc = function () {}

    //check overrides
    var funcr = {}
    var funce = {}
    var needed = {}
    var expandobj = {}

    if (def.sources !== undefined) {
        for (var skey in def.sources) {
            //check overrides
            var source = def.sources[skey]
            var allKeys = getAllKeys(source.prototype, {
                constructor: true,
                init: true
            })
            //check overrides
            var override = source.override ? source.override : {}
            var expandable = source.expandable ? source.expandable : {}

            for (var key in allKeys) {
                if (
                    funcr[key] !== undefined &&
                    override[key] == undefined &&
                    expandable[key] == undefined
                ) {
                    throw new Error(
                        `Overlay classes ${skey} Clobber on ${key} is not overrideable. Need to be added to override or expandable (for objects and arrays). `
                    )
                }
                if (override[key]) funcr[key] = true
                else funcr[key] = false

                if (expandable[key]) funce[key] = true
                else funce[key] = false
            }//end for loop

            deepSet(allKeys, dc.prototype, source.prototype, expandable)

            if (source.needed !== undefined) {
                for (var i in source.needed) {
                    needed[i] = source.needed[i]
                }
            }
			
			if(source.templates !== undefined) {
				source.templates(dc.prototype)
			}
        }//end source for loop
    }

    {
        var allKeys = getAllKeys(def.prototype, { constructor: true })

        for (var key in allKeys) {
            if (
                funcr[key] !== undefined &&
                !funcr[key] &&
                funce[key] !== undefined &&
                !funce[key]
            ) {
                throw new Error(
                    `Clobber on ${key} is not overrideable. Need to be added to override or expandable (for objects and arrays).`
                )
            }
        }

        deepSet(allKeys, dc.prototype, def.prototype, funce)

        {
            var allKeys = getAllKeys(def, { prototype: true })
            //check overrides
            deepSet(allKeys, dc, def)
        }
		
		if(def.templates !== undefined) {
			def.templates(dc.prototype)
		}

        if (def.needed != undefined) {
            for (var i in def.needed) {
                needed[i] = def.needed[i]
            }
        }
    }

    dc.needed = needed

    return new Proxy(dc, mclassConstructProxy)
}


//////mclass end
//////======

globalThis.deepClone = function (source, visited = new WeakMap()) {
    if (source === undefined || source == null || typeof source !== 'object') {
        return source
    }

    if (visited.has(source)) {
        return visited.get(source)
    }

    if (source instanceof Date) {
        const copy = new Date(source.getTime())
        visited.set(source, copy) // Register before returning
        return copy
    }

    if (source instanceof RegExp) {
        const copy = new RegExp(source.source, source.flags)
        visited.set(source, copy) // Register before returning
        return copy
    }

    if (source instanceof Map) {
        const copy = new Map()
        visited.set(source, copy) // Register before recursing into entries
        // Recursively clone keys and values
        source.forEach((value, key) => {
            copy.set(deepClone(key, visited), deepClone(value, visited))
        })
        return copy
    }

    if (source instanceof Set) {
        const copy = new Set()
        visited.set(source, copy) // Register before recursing into values
        // Recursively clone values
        source.forEach((value) => {
            copy.add(deepClone(value, visited))
        })
        return copy
    }

    const copy = Array.isArray(source)
        ? []
        : Object.create(Object.getPrototypeOf(source))

    visited.set(source, copy)

    Reflect.ownKeys(source).forEach((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(source, key)

        if (descriptor) {
            if (descriptor.hasOwnProperty('value')) {
                descriptor.value = deepClone(descriptor.value, visited)
            }

            Object.defineProperty(copy, key, descriptor)
        }
    })

    return copy
}

///////////

/*
globalThis.Msgc = function () {
    var calls = {}
    function o(id, ...args) {
        return calls[id].func(...args)
    }
    o.func = function (id) {
        if (calls[id] == undefined) {
            throw new Error(`msgc id ${id} is not defined`)
        }
        return calls[id].func
    }
    o.set = function (id, func) {
        if (!calls[id] && typeof calls[id] !== 'function') {
            calls[id] = {
                func: func,
                remove() {
                    o[id] = undefined
                }
            } //end calls setup single
        } else {
            calls[id].func = func
        }
    }
    o.add = function (id, func) {
        if (!calls[id] && !Array.isArray(calls[id])) {
            var self = (calls[id] = {
                funcs: [func],
                func(...args) {
                    var reta = []
                    var funcs = self.funcs

                    var l = funcs.length

                    for (var i = 0; i < l; i++) {
                        var ret = funcs[i].apply(null, args)
                        if (ret !== undefined) reta.push(ret)
                    }
                    return reta
                },
                remove(func) {
                    var a = self.funcs
                    var l = a.length
                    for (var i = 0; i < l; i++) {
                        if (a[i] === func) {
                            calls[id].splice(i, 1)
                            break
                        }
                    }
                }
            }) //end calls setup single
        } else {
            calls[id].funcs.push(func)
        }
    }
    o.remove = function (id, func) {
        calls[id].remove(func)
    }
    o.removeAll = function (id) {
        calls[id] = undefined
    }

    o.runScript = function (text) {
        var a = text
            .split('\n')
            .filter((n) => n.trim() !== '')
            .map((t) => t.trim())
        var l = a.length
        for (var i = 0; i < l; i++) {
            //alert("|"+a[i]+"|");
            eval(`o(${a[i]});`)
        }
    }

    return o
}

globalThis.$msgc = Msgc()
//*/

globalThis.Msgc = mclass({
	prototype: {
		init() {
			
		},
		add(name, func) {
			var call = ["_", name, "Calls"].join('')
			var self = this
			if(self[call] == undefined) {
				new Function(["self"], `
				self._${name}Calls = []
				self.${name} = function() {
					var a = this._${name}Calls
					var l = a.length
					for(var i = 0; i<l;i++) {
						a[i](...arguments)
					}
				}
			`)(self)
			}
			self[call].push(func)
	
		},
		remove(name, func) {
			var call = ["_", name, "Calls"].join('')
			if(this[call]!==undefined && func!== undefined) {
				var a = this[call]
				var l = a.length
				for (var i = 0; i < l; i++) {
					if (a[i] === func) {
						a[id].splice(i, 1)
						break
					}
				}
			} else {
				this[name]=undefined
			}
		},
		set(name, func) {
			var self = this
			var call = ["_", name, "Calls"].join('')
			if(self[call] !== undefined) {
				self[call]=undefined
			}
			self[name]=func
		}
	}
})





function funcrtID() {
    return funcrtID.atid++
}
funcrtID.atid = -1
globalThis.rtID = funcrtID

globalThis.isInt = function (value) {
    return typeof value === 'number' && Number.isInteger(value)
}

globalThis.isFloat = function (value) {
    return (
        typeof value === 'number' &&
        !Number.isInteger(value) &&
        Number.isFinite(value)
    )
}

globalThis.isBool = function (value) {
    return typeof value === 'boolean'
}

globalThis.isString = function (value) {
    return typeof value === 'string'
}

globalThis.isChar = function (value) {
    return typeof value === 'string' && value.length === 1
}

globalThis.setArray = function (a1, a2) {
    var l = a1.length
    for (var i = 0; i < l; i++) {
        if (a2[i] != undefined) {
            a1[i] = a2[i]
        }
    }
}

globalThis.EventsBus = mclass({
    prototype: {
        _target: undefined,
        _calls: {},
        _globals: [],
        init(o) {
            if (o == undefined) {
                this._target = this
            } else {
                if (o.eventTarget == undefined) {
                    this._target = this
                } else {
                    this._target = o.eventTarget
                }

                if (o.eventWatchers !== undefined) {
                    for (var i in o.eventWatchers) {
                        this.add(i, o.eventWatchers[i])
                    }
                }

                if (o.eventDefineWatchers !== undefined) {
                    var a = o.eventDefineWatchers
                    var l = a.length

                    for (var i = 0; i < l; i++) {
                        this.add(a[i])
                    }
                }

                if (o.eventGlobalWatcher !== undefined) {
                    this.addGlobal(o.eventGlobalWatcher)
                }
            }//end if for o defined
        },
        add(ids, func) {
            if (!Array.isArray(ids)) ids = [ids]
            var idl = ids.length
            for (var atid = 0; atid < idl; atid++) {
                var id = ids[atid]
                if (this._calls[id] == undefined) {
                    this._calls[id] = []
                    this._target[id] = new Function(
                        ['calls', 'globals'],
                        `
					return function(){
						var l = calls.length
						//todo maybe retuen array?
						for(var i= 0; i< l; i++) {
							calls[i](...arguments)
						}
						l = globals.length
						//todo maybe retuen array?
						for(var i= 0; i< l; i++) {
							globals[i]("${id}",...arguments)
						}
					}
					`
                    )(this._calls[id], this._globals)
                } //end if
                if (func !== undefined) {
                    this._calls[id].push(func)
                }
            } //end for id
        },
        remove(ids, func) {
            if (!Array.isArray(ids)) ids = [ids]
            var idl = ids.length
            for (var atid = 0; atid < idl; atid++) {
                var id = ids[atid]
                if (this._calls[id] !== undefined) {
                    var a = this._calls[id]
                    var l = a.length
                    for (var i = 0; i < l; i++) {
                        if (a[i] === func) {
                            this._calls[id].splice(i, 1)
                            break
                        }
                    }
                }
            } //end id for
        },
        addGlobal(func) {
            this._globals.push(func)
        },
        removeGlobal(func) {
            var a = this._globala
            var l = a.length
            for (var i = 0; i < l; i++) {
                if (a[i] === func) {
                    this._globals.splice(i, 1)
                    break
                }
            }
        }
    }
})

globalThis.PropertyObservers = mclass({
    prototype: {
        _target: undefined,
        _calls: {},
        _properties: undefined,
        _globals: [],
		_events:undefined,
        init(o) {
            if (o.propertyValues !== undefined) {
                this._properties = o.propertyValues
            } else {
                this._properties = {}
            }

            if (o.propertyTarget == undefined) {
                this._target = this
            } else {
                this._target = o.propertyTarget
            }

            for (var i in o.propertyValues) {
                var prop = o.propertyValues[i]
                if (prop !== null && typeof prop == 'object') {
                    throw new Error(
                        'property obsevers do not support objects or arrays. use function replacers.'
                    )
                }
                this.add(i)
            }
			
			/*
            if (o.propertyWatchers !== undefined) {
                for (var i in o.propertyWatchers) {
                    this.add(i, o.propertyWatchers[i])
                }
            }
            if (o.propertyGlobalWatcher !== undefined) {
                this.addGlobal(o.propertyGlobalWatcher)
            }*/
        },
        add(ids, func, v) {
            if (typeof v == 'object') {
                throw new Error(
                    'property obsevers do not support objects or arrays. use function replacers.'
                )
            }
            if (!Array.isArray(ids)) ids = [ids]
            var idl = ids.length
            for (var atid = 0; atid < idl; atid++) {
                var id = ids[atid]
                if (this._calls[id] == undefined) {
                    this._calls[id] = []

                    new Function(
                        ['target', 'properties', 'calls', 'globals'],
                        `
						Object.defineProperty(target, "${id}", {
				
						get() {
							//todo change
							if(typeof properties.${id} =="function") {
								return properties.${id}(properties)
							}
							return properties.${id}
						}, //end get
						set(v) {
				
							if(typeof properties.${id} =="function") {
								properties.${id}(properties, v)
							} else {
								properties.${id}=v
							}
				
							var l= calls.length
							
							
							for(var i = 0; i < l; i++) {
								calls[i](v)
							}
							l=globals.length
							for(var i=0;i<l;i++) {
								globals[i]("${id}",v)
							}
							//*/
							
							
							
						}//end set
					})
				`
                    )(
                        this._target,
                        this._properties,
                        this._calls[id],
                        this._globals
                    )
                } //end if
                if (func !== undefined) {
                    this._calls[id].push(func)
                }
                if (v !== undefined) {
                    this._target = v
                }
            } //end id for
        },
        remove(ids, func) {
            if (!Array.isArray(ids)) ids = [ids]
            var idl = ids.length
            for (var atid = 0; atid < idl; atid++) {
                if (this._calls[id] !== undefined) {
                    var a = this._calls[id]
                    var l = a.length
                    for (var i = 0; i < l; i++) {
                        if (a[i] === func) {
                            this._calls[id].splice(i, 1)
                            break
                        }
                    }
                }
            } //end id for
        },
        setValues(o) {
            for (var i in o) {
                if (this._properties[i] == undefined) {
                    this.add(i)
                }
                this._target[i] = o[i]
            }
        },
        addGlobal(func) {
            this._globals.push(func)
        },
        removeGlobal(func) {
            var a = this._globala
            var l = a.length
            for (var i = 0; i < l; i++) {
                if (a[i] === func) {
                    this._globals.splice(i, 1)
                    break
                }
            }
        }
    }
})


globalThis.props = function(p, o) {
	
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
	
	for(var i in v) {
		var vv=v[i]
		
		
		if(typeof vv !== "function") {
			
			p['_'+i]= vv
			
			var eventcalls=[]
			
			for(var ii in e) {
				eventcalls.push(`this.${ii}(this)`)
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
			
		} else {//end if
		
			p['_'+i]= vv
			var eventcalls=[]
			
			for(var ii in e) {
				eventcalls.push(`this.${ii}(this)`)
			}
			
			new Function(["p"], `
			
				defineProp(p, "${i}", {
					get() {
						return this._${i}()
					},
					set(v) {
						this._${i}(this, v)
						${eventcalls.join("\r\n")}
					}
				})
			`)(p)
		//*/
		}
		
		
		
	}
	//*/
}


globalThis.eventBus=function(p, o) {
	
	
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
