import cms from '../../data/website-admin.json';
export function GET(){return new Response(JSON.stringify({revision:cms.revision,paths:[...cms.posts,...cms.pages,...cms.works].map(p=>p.path)}),{headers:{'Content-Type':'application/json'}});}
