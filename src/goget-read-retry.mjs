// Use only around read-only operations. Never retry an uncertain mutation or
// billable provider transaction decode through this helper.
export async function retryRead(operation,{sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  for(let attempt=0;attempt<2;attempt++){
    try{return await operation();}
    catch(error){
      const transient=error?.name==='TimeoutError'||error?.code==='ETIMEDOUT'||
        /^HTTP_(502|503|504)$/.test(error?.message||'');
      if(attempt===1||!transient)throw error;
      await sleep(1000);
    }
  }
}
