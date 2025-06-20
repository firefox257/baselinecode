globalThis.deepclone = function (obj, hash = new WeakMap()) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (hash.has(obj)) return hash.get(obj); // Cyclic reference
    const clone = Array.isArray(obj) ? [] : {};
    hash.set(obj, clone);
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            clone[key] = deepclone(obj[key], hash);
        }
    }
    return clone;
};
var try1Properties = {
    title: "title"
};

function try1New() {
    return deepclone(try1Properties);
}

function try1Constructor(self, b) {
    if(b != undefined)
                    {
                        self.title = b.title
                    }
}

var t1 = try1New(); try1Constructor(t1)
        console.log(t1.title)