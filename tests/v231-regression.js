const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const game=fs.readFileSync(path.join(root,'public/js/game.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
function expect(cond,msg){if(!cond)throw new Error(msg)}
expect(game.includes('function clearKitchenRolePresentation()'),'Movie Night runtime crash fix missing: clearKitchenRolePresentation is undefined');
expect(game.includes("cameraFocusLevel !== currentLevel"),'smoothed camera target reset missing');
expect(game.includes("if (currentLevel === 'rain') {\n      cameraShake = 0;"),'Movie Night camera shake suppression missing');
expect(game.includes("const starts=[new THREE.Vector3(.15,0,3.8),new THREE.Vector3(1.35,0,3.8)]"),'Movie Night living-room spawn fix missing');
expect(index.includes('css/v23.css?v=2.3.1')||index.includes('css/v23.css?v=2.3.2'),'Movie Night visual stylesheet is not loaded');
expect(index.includes('game.js?v=2.3.1')||index.includes('game.js?v=2.3.2'),'Movie Night game cache-busting missing');
expect(index.includes('MOVIE NIGHT STABILITY FIX · v2.3.1')||index.includes('MOVIE NIGHT ORIENTATION FIX · v2.3.2'),'Movie Night hotfix version label missing');
console.log('V2.3.1 MOVIE NIGHT HOTFIX REGRESSION TEST PASSED');
