
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


        class c1
        {
            constructor()
            {
                console.log("here at c1")
            }
        }
        var v1 = new c1();
        var printthis =() =>
        {
            console.log("print this")
        }
        
       
       
        
        

        

        var Try1Properties = {
            x : 123,
            y : 124

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


var t1 = Try1New(); Try1Constructor(t1);; // Removed to match the target output
Try1printout(t1); // Removed to match the target output


var out1Properties = {

};

function out1func(self, arg1) {
    console.log("out1 log " + arg1)
}

function out1New() {
    return deepclone(out1Properties);
}

function out1Constructor(self, a, b) {
    self.a = a;
    self.b = b;
}

var out2Properties = {

};

function out2func1(self) {
    console.log("out2 log ")
}

function out2New() {
    return deepclone(out2Properties);
}

function out2Constructor(self) {
}

var Try2Properties = {

};

function Try2printout(self) {
    Try1printx(self);
    Try1printy(self);
    Try2printtitle(self);
    out1func(self, "an argument");
    out2func1(self);
    printthis();
}

function Try2printtitle(self) {
    console.log(self.title);
}

function Try2New() {
    return deepclone(Try2Properties);
}

function Try2Constructor(self, maybe) {
    console.log("maybe here 1")
    Try1Constructor(self);
    out1Constructor(self, 222, 333);
    out2Constructor(self);
    self.title += " and more";
}

var t2 = Try2New(); Try2Constructor(t2);
        Try2printout(t2)