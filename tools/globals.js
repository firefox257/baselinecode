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
            }

            deepSet(allKeys, dc.prototype, source.prototype, expandable)

            if (source.needed !== undefined) {
                for (var i in source.needed) {
                    needed[i] = source.needed[i]
                }
            }
        }
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




