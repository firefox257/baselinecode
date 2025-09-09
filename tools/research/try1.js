



const cloneFilter = (item, checkFunction, applyFunction, ...args) => {
    if(item==undefined||item==null) return item;
	
	// Case 1: The item is a single mesh (THREE.Mesh or Brush)
    if (checkFunction(item)) {
        return applyFunction(item, ...args);
    }
    // Case 2: The item is an array. Recursively process each element.
    else if (Array.isArray(item)) {
		var arr=[];
        item.forEach((subItem) => {
			arr.push(
				cloneFilter(subItem, checkFunction, applyFunction, ...args)
			);
		});
		return arr;
    }
    // Case 3: The item is a generic object. Recursively process its properties.
    else if (typeof item === 'object' && item !== null) {
		var obj={};
        for (const key in item) {
            if (Object.prototype.hasOwnProperty.call(item, key)) {
				
                obj[key]=cloneFilter(item[key], checkFunction,applyFunction, ...args);
            }
        }
		return obj;
    }
	
    // All other data types (strings, numbers, etc.) are returened.
	return item;
}




var t={
	title:"here1",
	bla:{
		mesh:[1,2,3],
		updated:true
	}
}



var t1=cloneFilter(t, 
(item)=>
{
	return false;
}, 
(item)=>
{ 
	console.log("here")
});


