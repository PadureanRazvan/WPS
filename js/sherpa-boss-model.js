/**
 * Sherpa's photo-inspired, articulated desk companion. All visible surfaces are
 * local 3D geometry; the optional canvas texture is only the scarf's paisley.
 * Facing +Z, feet at Y=0. Limb pivots point down their local Y.
 */
export function createSherpaBossModel(THREE) {
    const root = new THREE.Group();
    root.name = 'SherpaBoss';
    const joints = {};
    const ownedGeometry = new Set();
    const ownedMaterial = new Set();
    const ownedTexture = new Set();
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const material = (color, options = {}) => {
        const value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.53, ...options });
        ownedMaterial.add(value);
        return value;
    };
    const skin = material('#e6b8aa', { roughness: 0.64, specularIntensity: 0.28, sheen: 0.08, sheenColor: '#f4d4cd' });
    const skinFace = material('#ffffff', { vertexColors: true, roughness: 0.62, specularIntensity: 0.28, sheen: 0.09, sheenColor: '#f5d7cf' });
    const skinShadow = material('#bd8984', { roughness: 0.75, specularIntensity: 0.15 });
    const nostrilMaterial = material('#9e6868', { roughness: 0.85, specularIntensity: 0.08 });
    const blouse = material('#bcb0c2', { roughness: 0.65, sheen: 0.38, sheenColor: '#e2d5e8', sheenRoughness: 0.7 });
    const blouseLight = material('#cec0d2', { roughness: 0.58, sheen: 0.4 });
    const blouseSeam = material('#b3a5b7', { roughness: 0.8 });
    const trousers = material('#191921', { roughness: 0.82 });
    const shoe = material('#26232b', { roughness: 0.3, clearcoat: 0.28 });
    const hair = material('#29170f', { roughness: 0.48, sheen: 0.28, sheenColor: '#84513a', sheenRoughness: 0.56 });
    const hairMid = material('#3c2217', { roughness: 0.49, sheen: 0.25, sheenColor: '#a76d42' });
    const gold = material('#c79743', { metalness: 0.86, roughness: 0.24 });
    const silver = material('#d1d1d7', { metalness: 0.84, roughness: 0.3 });
    const lip = material('#ad435e', { roughness: 0.51, specularIntensity: 0.36, clearcoat: 0.07 });
    const lipLower = material('#cb6b80', { roughness: 0.47, specularIntensity: 0.4, clearcoat: 0.08 });
    const mouthLine = material('#843950', { roughness: 0.75, specularIntensity: 0.1 });
    const eyeWhite = material('#eee5df', { roughness: 0.38, specularIntensity: 0.3 });
    const pupil = material('#130f13', { roughness: 0.22 });
    const glint = new THREE.MeshBasicMaterial({ color: '#ffffff' }); ownedMaterial.add(glint);

    function mesh(parent, geometry, mat, name, position = [0, 0, 0]) {
        ownedGeometry.add(geometry);
        const object = new THREE.Mesh(geometry, mat);
        object.name = name;
        object.position.set(...position);
        object.castShadow = true;
        object.receiveShadow = true;
        parent.add(object);
        return object;
    }
    function ellipsoid(parent, name, position, scale, mat, segments = 24) {
        const object = mesh(parent, new THREE.SphereGeometry(1, segments, Math.max(12, segments / 2)), mat, name, position);
        object.scale.set(...scale);
        return object;
    }
    function curve(parent, name, points, radius, mat, segments = 32, radial = 6) {
        const path = new THREE.CatmullRomCurve3(points.map(point => V(...point)));
        return mesh(parent, new THREE.TubeGeometry(path, segments, radius, radial, false), mat, name);
    }
    function pivot(name, parent, position) {
        const group = new THREE.Group();
        group.name = name; group.position.set(...position); parent.add(group);
        joints[name] = group;
        return group;
    }
    function smoothClosedSeam(geometry, rows, segments) {
        const normals=geometry.attributes.normal;
        for(let row=0;row<rows;row++) {
            const first=row*(segments+1),last=first+segments;
            const normal=V(normals.getX(first)+normals.getX(last),normals.getY(first)+normals.getY(last),normals.getZ(first)+normals.getZ(last)).normalize();
            normals.setXYZ(first,normal.x,normal.y,normal.z);normals.setXYZ(last,normal.x,normal.y,normal.z);
        }
        normals.needsUpdate=true;
    }
    function ringSurface(parent, name, profiles, mat, segments = 48, modify) {
        const positions = [], normals = [], uv = [], indices = [];
        const ascending = profiles[profiles.length - 1][0] >= profiles[0][0];
        profiles.forEach(([y, rx, rz, centerZ = 0], row) => {
            for (let column = 0; column <= segments; column++) {
                const angle = column / segments * Math.PI * 2;
                const point = [Math.sin(angle) * rx, y, Math.cos(angle) * rz + centerZ];
                modify?.(point, angle, row);
                positions.push(...point); uv.push(column / segments, row / (profiles.length - 1));
                normals.push(0, 0, 0);
                if (row && column) {
                    const a = (row - 1) * (segments + 1) + column - 1, b = a + segments + 1;
                    if (ascending) indices.push(a, a + 1, b, a + 1, b + 1, b);
                    else indices.push(a, b, a + 1, a + 1, b, b + 1);
                }
            }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(indices); geometry.computeVertexNormals();smoothClosedSeam(geometry,profiles.length,segments);
        return mesh(parent, geometry, mat, name);
    }
    function patch(parent, name, outline, mat, depth = 0.015) {
        const shape = new THREE.Shape();
        outline.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
        shape.closePath();
        return mesh(parent, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, steps: 1 }), mat, name);
    }
    // A continuously sculpted shirt silhouette, including the soft hem and waist.
    ringSurface(root, 'Silk blouse', [
        [1.40, 0.38, 0.205], [1.43, 0.415, 0.226], [1.49, 0.414, 0.228],
        [1.65, 0.381, 0.22], [1.82, 0.343, 0.212], [1.98, 0.365, 0.245],
        [2.16, 0.413, 0.282], [2.32, 0.44, 0.261], [2.45, 0.465, 0.222],
        [2.50, 0.42, 0.182], [2.53, 0.28, 0.149], [2.55, 0.165, 0.12],
        [2.55, 0.001, 0.001]
    ], blouse, 56, (point, angle, row) => {
        const front = Math.max(0, Math.cos(angle));
        point[2] += front * Math.sin(angle * 7 + row * 0.55) * 0.007;
        if (row < 3) point[1] += Math.cos(angle * 2) * 0.017;
    });
    // The open collar exposes a modest V of skin, with two folded lapels.
    const neckline = patch(root, 'Open neckline', [[-.167, 2.53], [.167, 2.53], [.115, 2.35], [.012, 2.23], [-.108, 2.36]], skin);
    neckline.position.z = 0.239;
    const leftCollar = patch(root, 'Left pointed collar', [[-.156,2.57],[-.281,2.47],[-.238,2.30],[-.106,2.403]], blouseLight, .006);
    leftCollar.position.z = 0.248; leftCollar.rotation.y = -0.08;
    const rightCollar = patch(root, 'Right pointed collar', [[.154,2.57],[.283,2.47],[.236,2.30],[.104,2.403]], blouseLight, .006);
    rightCollar.position.z = 0.248; rightCollar.rotation.y = 0.08;
    curve(root, 'Blouse button placket', [[.014,1.44,.235],[.01,1.72,.226],[.012,1.96,.267],[.01,2.14,.291]], .006, blouseSeam, 20, 4);
    for (const [y,z] of [[1.51,.242],[1.76,.238],[2.00,.278]]) {
        ellipsoid(root, 'Gold blouse button', [.016,y,z], [.017,.022,.009], gold, 12);
    }
    // Collar chain follows the base of the neck rather than floating in front.
    ellipsoid(root, 'Neck', [0,2.56,.01], [.145,.235,.125], skin, 28);
    curve(root, 'Silver necklace', [[-.145,2.59,.065],[-.135,2.506,.145],[-.073,2.464,.182],[0,2.451,.19],[.074,2.465,.181],[.136,2.51,.137],[.145,2.58,.065]], .009, silver, 40, 7);

    function scarfTexture() {
        const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 512) : null;
        if (!canvas) return null;
        canvas.width = 256; canvas.height = 512;
        const context = canvas.getContext('2d');
        if (!context?.bezierCurveTo) return null;
        context.fillStyle = '#352437'; context.fillRect(0,0,256,512);
        context.strokeStyle = '#e2cddf'; context.lineWidth = 2.1;
        for (let row = -1; row < 8; row++) for (let col = 0; col < 4; col++) {
            context.save(); context.translate(col * 76 + (row % 2) * 34, row * 78 + 22); context.rotate((row + col) % 2 ? .48 : -.45);
            context.beginPath(); context.moveTo(0,-29); context.bezierCurveTo(32,-17,26,25,0,29); context.bezierCurveTo(-24,26,-20,-4,-5,-8); context.bezierCurveTo(5,-10,9,-1,6,5); context.bezierCurveTo(17,-7,8,-22,0,-29); context.stroke();
            context.beginPath(); context.ellipse(0,12,8,11,0,0,Math.PI*2); context.stroke();
            for (let petal=0;petal<9;petal++) { const a=petal/9*Math.PI*2; context.beginPath(); context.arc(Math.cos(a)*12,12+Math.sin(a)*15,1.2,0,Math.PI*2); context.stroke(); }
            context.restore();
        }
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1,2); ownedTexture.add(texture);
        return texture;
    }
    const scarf = material('#ffffff', { map: scarfTexture(), roughness: .58, sheen: .65, sheenColor: '#a98ca4', side: THREE.DoubleSide });
    if (!scarf.map) scarf.color.set('#453244');
    function ribbon(name, points, widths) {
        const path = new THREE.CatmullRomCurve3(points.map(p=>V(...p)));
        const positions=[],uv=[],indices=[]; const steps=36;
        for(let i=0;i<=steps;i++) {
            const t=i/steps, center=path.getPoint(t), tangent=path.getTangent(t);
            const side=V(tangent.y,-tangent.x,0).normalize();
            const f=t*(widths.length-1), n=Math.min(widths.length-2,Math.floor(f)), w=THREE.MathUtils.lerp(widths[n],widths[n+1],f-n);
            for(let edge=0;edge<5;edge++) {
                const u=edge/4-.5; const p=center.clone().addScaledVector(side,u*w); p.z+=Math.cos(u*Math.PI)*.014;
                positions.push(p.x,p.y,p.z);uv.push(edge/4,t);
                if(i&&edge){const a=(i-1)*5+edge-1,b=a+5;indices.push(a,a+1,b,a+1,b+1,b);}
            }
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
        return mesh(root,geometry,scarf,name);
    }
    ribbon('Paisley scarf left fold',[[-.122,2.46,.295],[-.095,2.32,.302],[-.041,2.16,.316],[-.028,2.03,.3]], [.075,.076,.069]);
    ribbon('Paisley scarf right fold',[[.13,2.46,.294],[.07,2.30,.32],[-.025,2.11,.326],[-.061,1.91,.303],[-.018,1.69,.261]], [.075,.075,.1,.115]);
    const clasp=mesh(root,new THREE.CylinderGeometry(.065,.065,.079,24,1,true),gold,'Gold scarf slide',[-.032,2.1,.324]);clasp.rotation.z=-.2;clasp.scale.z=.45;

    function limb(parent,name,profiles,mat) { return ringSurface(parent,name,profiles,mat,28); }
    function arm(side) {
        const label=side<0?'left':'right';
        const upper=pivot(`${label}UpperArm`,root,[side*.44,2.43,.015]);
        upper.rotation.z=side*.12;
        limb(upper,`${label} blouse sleeve`,[[.075,.002,.002],[.055,.094,.1],[.015,.14,.145],[-.12,.147,.142],[-.34,.121,.126],[-.49,.103,.107],[-.57,.101,.104]],blouse);
        const lower=pivot(`${label}Forearm`,upper,[0,-.52,0]);lower.rotation.x=-.1;
        limb(lower,`${label} forearm`,[[.05,.077,.078],[.03,.082,.084],[-.12,.084,.081],[-.29,.065,.065],[-.43,.049,.053],[-.48,.045,.048]],skin);
        limb(lower,`${label} rolled cuff`,[[.02,.113,.116],[-.01,.12,.119],[-.07,.118,.118],[-.13,.1,.106],[-.145,.093,.098]],blouseLight);
        curve(lower,`${label} cuff stitching`,[[-.086,-.107,.062],[0,-.12,.109],[.083,-.1,.068]],.004,blouseSeam,12,4);
        const tab=ellipsoid(lower,`${label} sleeve tab`,[side*.052,-.06,.115],[.025,.072,.009],blouse,16);tab.rotation.z=-side*.12;
        ellipsoid(lower,`${label} cuff button`,[side*.05,-.103,.125],[.012,.014,.006],gold,12);
        const hand=new THREE.Group();hand.name=`${label}Hand`;hand.position.set(0,-.45,.006);lower.add(hand);joints[`${label}Hand`]=hand;
        ellipsoid(hand,`${label} palm`,[0,-.055,0],[.058,.09,.037],skin,20);
        for(let finger=0;finger<4;finger++){
            const x=(finger-1.5)*.026, length=[.075,.096,.105,.087][finger];
            const digit=ellipsoid(hand,`${label} finger ${finger}`,[x,-.12-length*.25,.01],[.014,length*.55,.018],skin,12);digit.rotation.z=(finger-1.5)*.045;
            ellipsoid(hand,`${label} nail ${finger}`,[x,-.12-length*.68,.025],[.009,.015,.003],lipLower,10);
        }
        const thumb=ellipsoid(hand,`${label} thumb`,[-side*.064,-.063,.015],[.022,.058,.024],skin,14);thumb.rotation.z=-side*.42;
        if(side<0){
            const watchband=mesh(lower,new THREE.CylinderGeometry(.059,.062,.066,24,1,true),gold,'Gold watch bracelet',[0,-.375,0]);watchband.scale.z=1.03;
            const watch=mesh(lower,new THREE.BoxGeometry(.082,.067,.023),gold,'Rectangular gold watch',[0,-.375,.064]);
            mesh(lower,new THREE.BoxGeometry(.061,.049,.005),eyeWhite,'Ivory watch dial',[0,-.375,.078]);
            curve(lower,'Watch hands',[[.019,-.386,.082],[0,-.375,.083],[-.013,-.359,.082]],.0025,hair,4,4);
            const ring=mesh(hand,new THREE.TorusGeometry(.015,.0035,5,12),gold,'Fine gold ring',[.013,-.115,.011]);ring.rotation.x=Math.PI/2;
        }
    }
    arm(-1);arm(1);

    function leg(side) {
        const label=side<0?'left':'right';
        const thigh=pivot(`${label}Thigh`,root,[side*.19,1.46,0]);
        limb(thigh,`${label} trouser thigh`,[[.05,.168,.176],[-.04,.177,.179],[-.24,.151,.16],[-.49,.114,.126],[-.65,.1,.11]],trousers);
        const shin=pivot(`${label}Shin`,thigh,[0,-.65,0]);
        limb(shin,`${label} trouser shin`,[[.045,.103,.111],[-.16,.099,.104],[-.42,.075,.086],[-.69,.065,.077],[-.72,.066,.078]],trousers);
        curve(thigh,`${label} pressed trouser crease`,[[0,-.08,.18],[0,-.3,.157],[0,-.6,.113]],.003,shoe,15,4);
        const foot=new THREE.Group();foot.name=`${label}Foot`;foot.position.set(0,-.70,.025);shin.add(foot);
        ellipsoid(foot,`${label} leather shoe`,[0,-.038,.077],[.088,.072,.188],shoe,24);
        ellipsoid(foot,`${label} shoe sole`,[0,-.083,.075],[.09,.017,.186],trousers,20);
    }
    leg(-1);leg(1);

    const head=pivot('head',root,[0,2.72,.015]);
    head.scale.y=.96;
    const faceCenter=.38;
    const profiles = [
        [-.505,.008,.013,.04],[-.48,.096,.112,.035],[-.435,.175,.190,.013],[-.36,.246,.245,0],
        [-.26,.309,.278,0],[-.14,.350,.296,0],[0,.368,.308,0],[.14,.366,.317,-.006],
        [.27,.354,.323,-.012],[.39,.315,.305,-.018],[.49,.225,.244,-.025],[.55,.116,.135,-.028],[.575,.001,.001,-.03]
    ];
    function interpolateProfile(y) {
        let i=0;while(i<profiles.length-2&&profiles[i+1][0]<y)i++;
        const a=profiles[i],b=profiles[i+1],t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
        const before=profiles[Math.max(0,i-1)],after=profiles[Math.min(profiles.length-1,i+2)];
        return a.map((v,k)=>{
            if(k===0)return THREE.MathUtils.lerp(v,b[k],t);
            const value=.5*((2*v)+(-before[k]+b[k])*t+(2*before[k]-5*v+4*b[k]-after[k])*t*t+(-before[k]+3*v-3*b[k]+after[k])*t*t*t);
            return k===1||k===2?Math.max(.001,value):value;
        });
    }
    const gauss=(x,c,s)=>Math.exp(-(((x-c)/s)**2));
    function faceDepth(x,y) {
        const p=interpolateProfile(y), u=Math.min(.999,Math.abs(x)/Math.max(.001,p[1]));
        let z=p[2]*Math.sqrt(1-u*u)+p[3];
        z+=.069*gauss(x,0,.061)*gauss(y,.020,.185); // softly defined bridge
        z+=.074*gauss(x,0,.084)*gauss(y,-.104,.060); // rounded tip in the portrait
        z+=.018*gauss(Math.abs(x),.060,.028)*gauss(y,-.125,.034); // nasal wings
        z+=.004*gauss(x,0,.024)*gauss(y,-.147,.030); // short columella
        z+=.031*gauss(Math.abs(x),.216,.115)*gauss(y,-.10,.15); // full cheek planes
        z-=.024*gauss(Math.abs(x),.178,.087)*gauss(y,.095,.064); // orbital sockets
        z+=.013*gauss(x,0,.17)*gauss(y,-.255,.085); // muzzle and lip support
        z-=.004*gauss(x,0,.016)*gauss(y,-.207,.038); // restrained philtrum
        z-=.008*gauss(Math.abs(x),.145,.022)*gauss(y,-.225,.064); // soft smile folds
        z+=.010*gauss(x,0,.12)*gauss(y,-.405,.060); // softly rounded chin pad
        return z;
    }
    const denseProfiles=[];
    for(let row=0;row<=84;row++){const y=-.505+row/84*1.08;const p=interpolateProfile(y);denseProfiles.push([y+faceCenter,p[1],p[2],p[3]]);}
    const face=ringSurface(head,'Sculpted face',denseProfiles,skinFace,128,(point,angle)=>{
        if(Math.cos(angle)>0){const y=point[1]-faceCenter;const baseline=interpolateProfile(y);const original=Math.cos(angle)*baseline[2]+baseline[3];point[2]=THREE.MathUtils.lerp(original,faceDepth(point[0],y),Math.min(1,Math.cos(angle)*2));}
    });
    face.receiveShadow=false;
    const faceColors=[];const color=new THREE.Color();const skinBase=new THREE.Color('#e8bdaf'),cheekColor=new THREE.Color('#d88e96'),orbitalColor=new THREE.Color('#bf938b');
    function appendFaceColor(values,x,y,z) {
        const front=Math.max(0,Math.min(1,z*3));
        const blush=gauss(Math.abs(x),.23,.105)*gauss(y,-.11,.11)*front*.22;
        const orbit=gauss(Math.abs(x),.178,.098)*gauss(y,.126,.069)*front*.14;
        color.copy(skinBase).lerp(cheekColor,blush).lerp(orbitalColor,orbit);
        values.push(color.r,color.g,color.b);
    }
    const facePositions=face.geometry.attributes.position;
    for(let i=0;i<facePositions.count;i++){
        const x=facePositions.getX(i),y=facePositions.getY(i)-faceCenter,z=facePositions.getZ(i);
        appendFaceColor(faceColors,x,y,z);
    }
    face.geometry.setAttribute('color',new THREE.Float32BufferAttribute(faceColors,3));
    // Small nostril details reinforce the sculpted bridge without a separate nose.
    for(const side of [-1,1]){
        ellipsoid(head,'Nostril',[side*.055,faceCenter-.147,faceDepth(side*.055,-.147)+.001],[.013,.0045,.002],nostrilMaterial,18);
        ellipsoid(head,'Ear',[side*.386,faceCenter-.055,-.012],[.061,.116,.052],skin,20);
        ellipsoid(head,'Ear inner fold',[side*.403,faceCenter-.053,.029],[.027,.063,.011],skinShadow,16);
        const earring=mesh(head,new THREE.TorusGeometry(.024,.008,7,18),gold,'Small gold hoop',[side*.394,faceCenter-.146,.037]);earring.rotation.y=side*.45;
    }

    const eyes=[], brows=[];
    function eye(side) {
        const cx=side*.176,cy=.09+(side<0?.002:0),width=.103,upperHeight=side<0?.037:.035,lowerHeight=.025;
        const group=new THREE.Group();group.name=side<0?'Left eye':'Right eye';group.position.set(cx,faceCenter+cy,faceDepth(cx,cy)+.011);head.add(group);
        const positions=[],indices=[];const rings=7,samples=48;
        for(let ring=0;ring<=rings;ring++)for(let i=0;i<=samples;i++){
            const r=ring/rings,a=i/samples*Math.PI*2,x=Math.cos(a)*width*r;
            const y=Math.sin(a)*(Math.sin(a)>0?upperHeight:lowerHeight)*r*(.7+.3*Math.abs(Math.sin(a)))+side*x*.045;
            const z=.018*(1-r*r)-side*x*.20;
            positions.push(x,y,z);
            if(ring&&i){const p=(ring-1)*(samples+1)+i-1,q=p+samples+1;indices.push(p,q,p+1,p+1,q,q+1);}
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
        const white=mesh(group,geometry,eyeWhite,'Almond eye');white.receiveShadow=false;
        const eyeball=new THREE.Group();eyeball.name='Iris and pupil';group.add(eyeball);
        const irisPositions=[],irisColors=[],irisIndices=[];
        const irisBrown=new THREE.Color('#6c4936'),irisDark=new THREE.Color('#2d201b'),irisColor=new THREE.Color();
        for(let ring=0;ring<=8;ring++)for(let segment=0;segment<=72;segment++){
            const r=ring/8,a=segment/72*Math.PI*2;
            const x=Math.cos(a)*.039*r,edge=Math.pow(Math.max(0,1-(x/width)**2),.7);
            const y=THREE.MathUtils.clamp(Math.sin(a)*.034*r,-lowerHeight*edge+side*x*.045+.001,upperHeight*edge+side*x*.045-.001);
            irisPositions.push(x,y,.020+.003*(1-r*r)-side*x*.20);
            const fiber=(Math.sin(a*37+Math.sin(a*11)*2)+Math.sin(a*61))*.08;
            const pigment=THREE.MathUtils.clamp(.20+fiber+Math.sin(r*Math.PI)*.43,0,1);
            irisColor.copy(irisDark).lerp(irisBrown,pigment);irisColors.push(irisColor.r,irisColor.g,irisColor.b);
            if(ring&&segment){const p=(ring-1)*73+segment-1,q=p+73;irisIndices.push(p,q,p+1,p+1,q,q+1);}
        }
        const irisGeometry=new THREE.BufferGeometry();irisGeometry.setAttribute('position',new THREE.Float32BufferAttribute(irisPositions,3));irisGeometry.setAttribute('color',new THREE.Float32BufferAttribute(irisColors,3));irisGeometry.setIndex(irisIndices);irisGeometry.computeVertexNormals();
        const iris=mesh(eyeball,irisGeometry,material('#ffffff',{vertexColors:true,roughness:.47,specularIntensity:.28}),'Chestnut iris');iris.receiveShadow=false;
        ellipsoid(eyeball,'Pupil',[0,0,.025],[.019,.021,.0015],pupil,28);
        ellipsoid(eyeball,'Eye catchlight',[-.009,.010,.029],[.0045,.004,.001],glint,12);
        ellipsoid(eyeball,'Small eye catchlight',[.010,-.010,.028],[.0018,.0018,.001],glint,10);
        const lidPoints=[];const lowerPoints=[];
        for(let i=0;i<=16;i++){
            const x=(i/16*2-1)*width,u=x/width,envelope=Math.pow(Math.max(0,1-u*u),.7);
            lidPoints.push([x,envelope*upperHeight+side*x*.045,.006-side*x*.20]);
            lowerPoints.push([x,-envelope*lowerHeight+side*x*.045,.004-side*x*.20]);
        }
        const upper=curve(group,'Fine upper lash line',lidPoints,.0035,hair,36,7);upper.receiveShadow=false;
        const lower=curve(group,'Lower eyelid rim',lowerPoints,.0032,skinShadow,36,6);lower.receiveShadow=false;
        function fleshyLid(isUpper) {
            const positions=[],colors=[],weights=[],indices=[],steps=32,bands=6;
            for(let i=0;i<=steps;i++) {
                const x=(i/steps*2-1)*width,u=x/width,envelope=Math.pow(Math.max(0,1-u*u),.7);
                const edge=(isUpper?upperHeight:-lowerHeight)*envelope+side*x*.045;
                for(let band=0;band<=bands;band++) {
                    const t=band/bands,span=(isUpper?.023:-.013)*Math.pow(Math.max(0,1-u*u),.48);
                    const y=edge+span*t;
                    const innerZ=.004-side*x*.20;
                    const outerZ=faceDepth(cx+x,cy+y)-group.position.z;
                    const z=THREE.MathUtils.lerp(innerZ,outerZ,t)+Math.sin(t*Math.PI)*.0008;
                    positions.push(x,y,z);weights.push((1-t)*envelope);
                    appendFaceColor(colors,cx+x,cy+y,z+group.position.z);
                    if(i&&band){const a=(i-1)*(bands+1)+band-1,b=a+bands+1;if(isUpper)indices.push(a,b,a+1,a+1,b,b+1);else indices.push(a,a+1,b,a+1,b+1,b);}
                }
            }
            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
            for(let i=0;i<=steps;i++){
                const index=i*(bands+1)+bands,x=cx+positions[index*3],y=cy+positions[index*3+1],e=.001;
                const n=V(-(faceDepth(x+e,y)-faceDepth(x-e,y))/(2*e),-(faceDepth(x,y+e)-faceDepth(x,y-e))/(2*e),1).normalize();
                geometry.attributes.normal.setXYZ(index,n.x,n.y,n.z);
            }
            const lid=mesh(group,geometry,skinFace,isUpper?'Soft upper lid hood':'Soft lower eyelid');lid.receiveShadow=false;
            return {mesh:lid,base:Float32Array.from(positions),weights,baseNormals:geometry.attributes.normal.array.slice(),bands};
        }
        const hood=fleshyLid(true);fleshyLid(false);
        const creasePoints=[];
        for(let i=0;i<=18;i++){const x=(i/18*2-1)*width*.93,u=x/width,envelope=Math.pow(Math.max(0,1-u*u),.7),y=envelope*(upperHeight+.018)+side*x*.045;creasePoints.push([x,y,faceDepth(cx+x,cy+y)-group.position.z+.001]);}
        const crease=curve(group,'Subtle upper lid crease',creasePoints,.0009,skinShadow,28,5);crease.receiveShadow=false;
        // Tapered flattened brow follows the skin instead of sitting on it as a tube.
        const browPositions=[],browIndices=[];
        for(let i=0;i<=40;i++){
            const t=i/40,x=side*(.069+t*.207),y=.169+.025*Math.sin(t*Math.PI)-t*.014+(side<0?.005:0);
            const taper=Math.min(1,t/.10)*Math.pow(1-t,.55);
            const halfHeight=(.012+.003*Math.sin(t*Math.PI))*taper+.001;
            for(let band=0;band<3;band++){
                const py=y+(band-1)*halfHeight,pz=faceDepth(x,py)+.006+Math.sin(band/2*Math.PI)*.0015;
                browPositions.push(x,faceCenter+py,pz);
                if(i&&band){const a=(i-1)*3+band-1,b=a+3;if(side>0)browIndices.push(a,b,a+1,a+1,b,b+1);else browIndices.push(a,a+1,b,a+1,b+1,b);}
            }
        }
        const browGeometry=new THREE.BufferGeometry();browGeometry.setAttribute('position',new THREE.Float32BufferAttribute(browPositions,3));browGeometry.setIndex(browIndices);browGeometry.computeVertexNormals();
        const eyebrow=mesh(head,browGeometry,hairMid,'Natural tapered eyebrow');eyebrow.receiveShadow=false;
        brows.push({ mesh: eyebrow, base: browGeometry.attributes.position.array.slice() });
        eyes.push({group,white,eyeball,upper,hood});
    }
    eye(-1);eye(1);
    // Lips have a Cupid's bow and a restrained, slightly asymmetric smile.
    const mouth=new THREE.Group();mouth.name='Smile';head.add(mouth);
    function lipSurface(isUpper) {
        const positions=[],indices=[];const n=48;
        for(let i=0;i<=n;i++){
            const x=(i/n*2-1)*.161,u=x/.161,curveSmile=.019*u*u+.005*u;
            const seam=-.267+curveSmile;
            const fullness=Math.pow(Math.max(0,1-u*u),.72);
            const thickness=isUpper ? (.034+.009*gauss(Math.abs(x),.047,.033)-.007*gauss(x,0,.025))*fullness : .045*fullness;
            for(let band=0;band<7;band++){
                const t=band/6,y=seam+(isUpper?1:-1)*thickness*t,z=faceDepth(x,y)+.006*fullness+Math.sin(t*Math.PI)*.018*fullness;
                positions.push(x,faceCenter+y,z);
                if(i&&band){const a=(i-1)*7+band-1,b=a+7;indices.push(a,b,a+1,a+1,b,b+1);}
            }
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
        const result=mesh(mouth,geometry,isUpper?lip:lipLower,isUpper?'Cupid bow upper lip':'Soft lower lip');result.material.side=THREE.DoubleSide;result.receiveShadow=false;
    }
    lipSurface(true);lipSurface(false);
    const seam=[];
    for(let i=0;i<=24;i++){const x=(i/24*2-1)*.161,u=x/.161,y=-.267+.019*u*u+.005*u;seam.push([x,faceCenter+y,faceDepth(x,y)+.007]);}
    const smileCrease=curve(mouth,'Smile crease',seam,.0022,mouthLine,36,5);smileCrease.receiveShadow=false;
    const lipShapes = mouth.children.map(mesh => ({ mesh, base: mesh.geometry.attributes.position.array.slice() }));

    // Two continuous hair surfaces avoid intersecting locks and shadow bands.
    // The raised forehead, offset part and swept volume follow the photograph.
    const capPositions=[],capIndices=[];const capRows=40,capColumns=96;
    for(let row=0;row<=capRows;row++)for(let col=0;col<=capColumns;col++){
        const angle=col/capColumns*Math.PI*2;
        const front=Math.max(0,Math.cos(angle));
        const lower=faceCenter-.22+front*.70-Math.sin(angle)*.062;
        const top=faceCenter+.59,t=row/capRows,y=THREE.MathUtils.lerp(lower,top,t);
        const profile=interpolateProfile(y-faceCenter);
        const crownFade=Math.min(1,Math.max(0,(top-y)/.045));
        const sweep=.025*Math.max(0,Math.sin(angle))*Math.sin(t*Math.PI);
        const groove=.0025*Math.sin(angle*16+t*4)*Math.sin(t*Math.PI);
        const shell=.064-.018*t;
        let radiusX=(profile[1]+shell+sweep+groove)*crownFade,radiusZ=(profile[2]+shell+.014+sweep+groove)*crownFade;
        if(y>.85){const dome=Math.sqrt(Math.max(0,(top-y)/.12));radiusX=Math.max(radiusX,.30*dome);radiusZ=Math.max(radiusZ,.29*dome);}
        capPositions.push(Math.sin(angle)*radiusX,y,Math.cos(angle)*radiusZ+profile[3]);
        if(row&&col){const a=(row-1)*(capColumns+1)+col-1,b=a+capColumns+1;capIndices.push(a,a+1,b,a+1,b+1,b);}
    }
    const capGeometry=new THREE.BufferGeometry();capGeometry.setAttribute('position',new THREE.Float32BufferAttribute(capPositions,3));capGeometry.setIndex(capIndices);capGeometry.computeVertexNormals();smoothClosedSeam(capGeometry,capRows+1,capColumns);
    const crown=mesh(head,capGeometry,hair,'Chestnut crown');crown.receiveShadow=false;
    const curtainPositions=[],curtainIndices=[],curtainRows=52,curtainColumns=96;
    const curtainLayer=(curtainRows+1)*(curtainColumns+1);
    for(let inner=0;inner<2;inner++)for(let row=0;row<=curtainRows;row++)for(let col=0;col<=curtainColumns;col++){
        const t=row/curtainRows,angle=.88+col/curtainColumns*(Math.PI*2-1.76);
        const y=.80-t*1.075+Math.pow(t,5)*.035*Math.sin(angle*7);
        const volume=Math.sin(Math.min(1,t/.38)*Math.PI/2);
        const wave=Math.sin(t*Math.PI*3.9+Math.sin(angle)*1.1)*.053*volume;
        const channels=.010*Math.sin(angle*15+t*4)*volume;
        const topProfile=interpolateProfile(.80-faceCenter);
        const shoulderVolume=Math.sin(Math.min(1,t/.32)*Math.PI/2);
        const tip=Math.max(0,(t-.82)/.18);
        const thickness=.025*(1-.82*tip);
        const rx=THREE.MathUtils.lerp(topProfile[1]+.050,.455,shoulderVolume)+wave+channels-.032*tip-thickness*inner;
        const rz=THREE.MathUtils.lerp(topProfile[2]+.060,.326,shoulderVolume)+wave*.62+channels+.030*tip-thickness*inner;
        curtainPositions.push(Math.sin(angle)*rx,y,Math.cos(angle)*rz-.025);
        if(row&&col){const a=inner*curtainLayer+(row-1)*(curtainColumns+1)+col-1,b=a+curtainColumns+1;if(inner)curtainIndices.push(a,a+1,b,a+1,b+1,b);else curtainIndices.push(a,b,a+1,a+1,b,b+1);}
    }
    for(let row=0;row<curtainRows;row++)for(const col of [0,curtainColumns]){
        const a=row*(curtainColumns+1)+col,b=a+curtainColumns+1,c=a+curtainLayer,d=b+curtainLayer;
        if(col===0)curtainIndices.push(a,c,b,b,c,d);else curtainIndices.push(a,b,c,b,d,c);
    }
    for(let col=0;col<curtainColumns;col++)for(const row of [0,curtainRows]){
        const a=row*(curtainColumns+1)+col,b=a+1,c=a+curtainLayer,d=c+1;
        if(row===0)curtainIndices.push(a,b,c,b,d,c);else curtainIndices.push(a,c,b,b,c,d);
    }
    const curtainGeometry=new THREE.BufferGeometry();curtainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(curtainPositions,3));curtainGeometry.setIndex(curtainIndices);curtainGeometry.computeVertexNormals();
    const curtain=mesh(head,curtainGeometry,hair,'Continuous shoulder length waves');curtain.receiveShadow=false;

    // Explicit APIs keep controller animation independent from mesh construction.
    let disposed=false,lastBlink=0;
    function blink(amount=0) {
        amount=THREE.MathUtils.clamp(Number.isFinite(amount)?amount:0,0,1);
        if(amount===lastBlink)return;
        lastBlink=amount;
        const openness=THREE.MathUtils.clamp(1-amount,0.045,1);
        for(const eye of eyes){
            eye.white.scale.y=openness;eye.eyeball.scale.y=openness;eye.upper.scale.y=openness;eye.upper.position.y=-amount*.018;
            const positions=eye.hood.mesh.geometry.attributes.position;
            for(let i=0;i<positions.count;i++)positions.setY(i,eye.hood.base[i*3+1]-amount*.052*eye.hood.weights[i]);
            positions.needsUpdate=true;eye.hood.mesh.geometry.computeVertexNormals();
            const normals=eye.hood.mesh.geometry.attributes.normal;
            for(let i=eye.hood.bands;i<positions.count;i+=eye.hood.bands+1)normals.setXYZ(i,eye.hood.baseNormals[i*3],eye.hood.baseNormals[i*3+1],eye.hood.baseNormals[i*3+2]);
        }
    }
    let lastExpression=-1;
    function setMood({speaking=0,thinking=false,discomfort=0,impact=0}={}) {
        // A subtle lower-lip motion avoids exaggerated talking-head distortion.
        mouth.scale.y=1+Math.max(0,Math.min(1,speaking))*.025;
        for(const eye of eyes)eye.eyeball.position.x=thinking ? .008 : 0;
        const expression=THREE.MathUtils.clamp(Math.max(discomfort,impact*.9),0,1);
        if(Math.abs(lastExpression-expression)<.008)return;
        lastExpression=expression;
        for(const {mesh,base} of lipShapes){
            const positions=mesh.geometry.attributes.position;
            for(let i=0;i<positions.count;i++){
                const x=base[i*3],y=base[i*3+1]-faceCenter,u=Math.min(1,Math.abs(x)/.161);
                const nx=x*(1-expression*.12),ny=y-expression*.050*u*u+expression*.009;
                const relief=base[i*3+2]-faceDepth(x,y);
                positions.setXYZ(i,nx,faceCenter+ny,faceDepth(nx,ny)+relief);
            }
            positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
        }
        for(const {mesh,base} of brows){
            const positions=mesh.geometry.attributes.position;
            for(let i=0;i<positions.count;i++){
                const x=base[i*3],y=base[i*3+1]-faceCenter;
                const worry=(1-THREE.MathUtils.clamp((Math.abs(x)-.069)/.207,0,1))*.030-.007;
                const ny=y+expression*worry;
                positions.setXYZ(i,x,faceCenter+ny,faceDepth(x,ny)+base[i*3+2]-faceDepth(x,y));
            }
            positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
        }
    }
    function dispose() {
        if(disposed)return;disposed=true;
        ownedGeometry.forEach(value=>value.dispose());ownedMaterial.forEach(value=>value.dispose());ownedTexture.forEach(value=>value.dispose());
    }
    root.userData.appearance='Photo-inspired chestnut hair, lilac blouse, plum paisley scarf and gold accessories';
    root.userData.modelKind='articulated-procedural-mesh';
    return {root,joints,eyes,blink,setMood,dispose};
}
