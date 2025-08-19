// Edit and save to update!
return floor(
	difference(
		color(0x0000ffff,sphere({ r: 20, fn:100 })),
		translate([15, 0, 0], cube([20, 20, 20])),
		translate([0, 0, 15], cylinder({ r: 20, h: 30 , fn:100}))
	)
);