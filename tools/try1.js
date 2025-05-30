globalThis.deepclone = 
function (obj, hash = new WeakMap()) {
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

var Try1Properties = {
    x: 123,
    y: 124
};

function Try1printout(self) {
    Try1printx(self);
    Try1printy(self);
}

function Try1printx(self) {
    console.log(self.x);
}

function Try1printy(self) {
    console.log(self.y);
}

function Try1New() {
    return deepclone(Try1Properties);
}

function Try1Constructor(self) {
    self.x = 0;
    self.y = 3333
}

var out1Properties = {

};

function out1func(self) {
    console.log("out1 log")
}

function out1New() {
    return deepclone(out1Properties);
}

function out1Constructor(self) {
}

var Try2Properties = {
    x: 123,
    y: 124,
    title: "hi there"
};

function Try2printout(self) {
    Try1printx(self);
    Try1printy(self);
    Try2printtitle(self);
    out1func(self);
}

function Try2printtitle(self) {
    console.log(self.title);
}

function Try2New() {
    return deepclone(Try2Properties);
}

function Try2Constructor(self) {
    Try1Constructor(self);
    out1Constructor(self);
    self.title += " and more";
}

var t2 = Try2New(); Try2Constructor(t2);
        Try2printout(t2);