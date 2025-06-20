




var monster = {
    hp: 2,
    dm: 1
}

var hero = {
    hp: 10,
    dm: 2
}


hero.hp = hero.hp - monster.dm;
console.log(hero.hp);

monster.hp = monster.hp - hero.dm;
console.log(monster.hp);    


if(hero.hp <1)
{
    console.log("hero died! booo.")
}

if(monster.hp <1)
{
    console.log("monster died! horay!!!.")
}   

