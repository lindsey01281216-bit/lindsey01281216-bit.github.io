import cms from '../../data/website-admin.json';
export function GET(){return new Response(JSON.stringify({revision:cms.revision,works:cms.works}),{headers:{'Content-Type':'application/json'}});}
