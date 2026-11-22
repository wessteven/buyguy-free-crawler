// An HTTP-success GraphQL response may still contain errors or no usage evidence.
export function assessCapacityAnalytics(response){
 if(Array.isArray(response?.errors)&&response.errors.length)return {status:'GRAPHQL_ERRORS_USAGE_UNVERIFIED'};
 const groups=response?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
 if(!Array.isArray(groups))return {status:'NO_ANALYTICS_RESPONSE'};
 if(!groups.length)return {status:'NO_ANALYTICS_GROUPS_USAGE_UNVERIFIED',groupCount:0};
 const fields=['rowsRead','rowsWritten','readQueries','writeQueries'];
 const totals=Object.fromEntries(fields.map(k=>[k,null]));
 for(const k of fields){
   const values=groups.map(x=>x?.sum?.[k]);
   if(values.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0))totals[k]=values.reduce((a,b)=>a+b,0);
 }
 return {status:fields.every(k=>totals[k]!==null)?'AVAILABLE':'PARTIAL_ANALYTICS_FIELDS',daysQueried:30,totals,groupCount:groups.length};
}
