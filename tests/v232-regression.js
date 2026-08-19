const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const game=fs.readFileSync(path.join(root,'public/js/game.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
function expect(cond,msg){if(!cond)throw new Error(msg)}
expect(game.includes('sofa.rotation.y=0;scene.add(sofa);'),'Movie Night sofa is not facing the TV wall');
expect(game.includes("distanceXZ(player.group.position,r.blanket.position)<2.25"),'Blanket pickup distance still targets the mesh object instead of its position');
expect(index.includes('css/v23.css?v=2.3.2'),'v2.3.2 stylesheet cache bust missing');
expect(index.includes('game.js?v=2.3.2'),'v2.3.2 game cache bust missing');
expect(index.includes('MOVIE NIGHT ORIENTATION FIX · v2.3.2'),'v2.3.2 local version label missing');
console.log('V2.3.2 MOVIE NIGHT ORIENTATION REGRESSION TEST PASSED');
