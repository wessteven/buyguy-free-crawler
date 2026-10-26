package dev.whatsgood.pocketradar;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Independent, authenticated, read-only GOGET research source. No admin credential or trades. */
final class GogetRepository {
    static final String URL="https://buyguy-free-radar.wessteven.workers.dev/api/pocket-radar/feed";
    private static final String PREFS="pocket-goget-v1";
    private static final long MIN_FETCH_MS=300_000L;
    private static final long STALE_MS=15*60_000L;
    static final class Candidate {
        final String symbol,mint,pool,chart,observedAt,tier,greenStatus,buyerEvidence;
        final double price,cap,liquidity,score,changeH1;
        final int buys,sells,greenPassed;
        final Long poolAgeMinutes;
        final boolean lpLock;
        Candidate(JSONObject j) {
            mint=j.optString("mint","");
            pool=j.optString("pool","");
            if(!solana(mint)||!solana(pool)||!("solana:"+mint).equals(j.optString("assetKey")))
                throw new IllegalArgumentException("Missing exact mint/pool identity");
            symbol=j.optString("symbol","Unknown");
            chart="https://www.geckoterminal.com/solana/pools/"+pool;
            observedAt=j.optString("quoteObservedAt","");
            if(observedAt.isEmpty())throw new IllegalArgumentException("Missing quote observation time");
            try{Instant.parse(observedAt);}catch(Exception e){throw new IllegalArgumentException("Invalid observation time");}
            price=j.optDouble("priceUsd",Double.NaN);cap=j.optDouble("marketCapUsd",Double.NaN);
            liquidity=j.optDouble("liquidityUsd",Double.NaN);score=j.optDouble("ourScore",Double.NaN);
            if(!Double.isFinite(score)||score<0||score>100||!Double.isFinite(price)||price<=0||
               !Double.isFinite(cap)||cap<=0||!Double.isFinite(liquidity)||liquidity<15000)
                throw new IllegalArgumentException("Invalid GOGET market evidence");
            changeH1=j.isNull("changeH1")?Double.NaN:j.optDouble("changeH1",Double.NaN);
            buys=j.optInt("buys5",-1);sells=j.optInt("sells5",-1);
            if(buys<0||sells<0)throw new IllegalArgumentException("Transaction evidence missing");
            tier=j.optString("tier","NOT");greenStatus=j.optString("greenStatus","UNASSESSED");
            greenPassed=j.optInt("greenPassed",0);lpLock=j.optBoolean("lpLockVerified",false);
            buyerEvidence=j.optString("buyerEvidence","");
            if(!"reported_transactions_only".equals(buyerEvidence)||
              !j.isNull("verifiedUniqueBuyers"))throw new IllegalArgumentException("Buyer verification overstated");
            poolAgeMinutes=j.isNull("poolAgeMinutes")?null:j.optLong("poolAgeMinutes");
        }
        String line(long now){
            long quoteMillis=Instant.parse(observedAt).toEpochMilli();
            long age=Math.max(0,(now-quoteMillis)/60000);
            String freshness=now-quoteMillis>30*60_000L?"STALE OBSERVATION":"OBSERVED";
            return symbol+"  OUR SCORE "+String.format(Locale.US,"%.1f",score)+"/100 · "+tier+
              "\n"+RadarRepository.formatPrice(price)+" · Cap "+RadarRepository.compact(cap)+
              " · LP "+RadarRepository.compact(liquidity)+
              "\n1h "+RadarRepository.formatMove(changeH1)+" · 5m transactions "+
              buys+"/"+sells+" (NOT unique buyers)"+
              "\n"+freshness+" "+age+"m ago · pool age "+
              (poolAgeMinutes==null?"unknown":poolAgeMinutes+"m")+
              " · safety "+greenStatus+" "+greenPassed+"/7"+
              (lpLock?" · LP lock screen passed":" · LP lock NOT verified");
        }
    }
    static final class Snapshot{
        final List<Candidate> coins;final long fetchedAt;final String generatedAt,problem;
        final int sampleSize;
        Snapshot(List<Candidate> coins,long fetchedAt,String generatedAt,int sampleSize,String problem){
            this.coins=coins;this.fetchedAt=fetchedAt;this.generatedAt=generatedAt;
            this.sampleSize=sampleSize;this.problem=problem;
        }
        String status(){
            if(fetchedAt==0)return problem==null?"GOGET not loaded":problem;
            long age=Math.max(0,(System.currentTimeMillis()-fetchedAt)/1000);
            return (System.currentTimeMillis()-fetchedAt>STALE_MS?"STALE · ":"")+
             "GOGET RESEARCH · fetched "+age+"s ago · sample "+sampleSize+"/80"+
             (problem==null?"":" · "+problem);
        }
    }
    static String token(Context c){
        return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("token","");
    }
    static boolean paired(Context c){return token(c).matches("^pr1\\.[0-9]{10}\\.[0-9a-f]{32}\\.[0-9a-f]{64}$");}
    static boolean pair(Context c,String supplied){
        String value=supplied==null?"":supplied.trim();
        if(!value.matches("^pr1\\.[0-9]{10}\\.[0-9a-f]{32}\\.[0-9a-f]{64}$"))return false;
        c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit()
            .putString("token",value).remove("attempt").remove("problem").remove("data")
            .remove("at").apply();
        return true;
    }
    static void clear(Context c){
        c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().clear().apply();
    }
    static Snapshot cached(Context c){
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        return decode(p.getString("data",""),p.getLong("at",0),p.getString("problem",null));
    }
    static Snapshot decode(String json,long receivedAt,String problem){
        if(json==null||json.isEmpty())return new Snapshot(new ArrayList<>(),0,"",0,problem);
        try{
            JSONObject root=new JSONObject(json);
            if(!"goget-pocket-v1".equals(root.optString("schema"))||
               !"GOGET_D1_RESEARCH".equals(root.optString("source")))
                throw new IllegalArgumentException("Unexpected GOGET source");
            String generatedAt=root.getString("generatedAt");
            Instant.parse(generatedAt);
            JSONObject sample=root.getJSONObject("sample");
            int count=sample.getInt("assets");
            if(count<0||count>80||sample.optInt("assetLimit")!=80)
                throw new IllegalArgumentException("Invalid sample bounds");
            JSONArray arr=root.getJSONArray("coins");
            if(arr.length()>5)throw new IllegalArgumentException("Invalid ranking size");
            List<Candidate> coins=new ArrayList<>();
            for(int i=0;i<arr.length();i++)coins.add(new Candidate(arr.getJSONObject(i)));
            return new Snapshot(coins,receivedAt,generatedAt,count,problem);
        }catch(Exception e){return new Snapshot(new ArrayList<>(),0,"",0,"GOGET data invalid · "+e.getClass().getSimpleName());}
    }
    static synchronized Snapshot refresh(Context c){
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        if(!paired(c))return new Snapshot(new ArrayList<>(),0,"",0,"PAIR GOGET in the dashboard first");
        long now=System.currentTimeMillis();
        if(now-p.getLong("attempt",0)<MIN_FETCH_MS)return cached(c);
        p.edit().putLong("attempt",now).apply();
        HttpURLConnection connection=null;
        try{
            // No redirects: a bearer token must never be forwarded to a different host.
            connection=(HttpURLConnection)new URL(URL).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000);connection.setReadTimeout(7000);
            connection.setRequestProperty("Accept","application/json");
            connection.setRequestProperty("Authorization","Bearer "+token(c));
            connection.setRequestProperty("User-Agent","PocketRadar/0.8 (GOGET read-only)");
            int code=connection.getResponseCode();
            if(code!=200)throw new IllegalStateException(code==401?"Pair expired or invalid":
              code==503?"GOGET unavailable / D1 quota":"GOGET HTTP "+code);
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            try(InputStream in=connection.getInputStream()){
                byte[] b=new byte[4096];int n;
                while((n=in.read(b))!=-1){
                    out.write(b,0,n);if(out.size()>128_000)throw new IllegalStateException("Response too large");
                }
            }
            String body=out.toString(StandardCharsets.UTF_8.name());
            Snapshot check=decode(body,now,null);
            if(check.fetchedAt==0)throw new IllegalArgumentException(check.problem);
            p.edit().putString("data",body).putLong("at",now).remove("problem").apply();
            return check;
        }catch(Exception e){
            String msg=e.getMessage();
            if(msg==null||msg.length()>70)msg="GOGET network or parse error";
            p.edit().putString("problem",msg).apply();
            return cached(c);
        }finally{if(connection!=null)connection.disconnect();}
    }
    private static boolean solana(String s){
        return s!=null&&s.matches("[1-9A-HJ-NP-Za-km-z]{32,44}");
    }
    private GogetRepository(){}
}
