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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Read-only public market ticker. Provider identities, never token display names, govern deduplication. */
final class RadarRepository {
    static final String DASHBOARD="https://buyguy-free-radar.wessteven.workers.dev/dashboard";
    private static final String GECKO="https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?duration=5m&include=base_token";
    private static final String BOOSTS="https://api.dexscreener.com/token-boosts/top/v1";
    private static final String DEX_TOKENS="https://api.dexscreener.com/tokens/v1/solana/";
    private static final String PREFS="pocket-radar-v05";
    private static final long FETCH_FLOOR_MS=60_000L, STALE_MS=5*60_000L;
    private static final double RESERVE_FLOOR=50_000;
    private static final int MAX_BYTES=950_000;
    private static final int MAX_COINS=5;

    static final class Coin {
        final String name, identity, url;
        final double usd,m5,h1,reserve,marketCap,fdv;
        Coin(String name,String identity,double usd,double m5,double h1,double reserve,
            double marketCap,double fdv,String url){
            this.name=name;this.identity=identity;this.usd=usd;this.m5=m5;this.h1=h1;
            this.reserve=reserve;this.marketCap=marketCap;this.fdv=fdv;this.url=url;
        }
        String line(){
            return name+"  "+formatPrice(usd)+"   5m "+formatMove(m5)+"  1h "+formatMove(h1)+
                "\n"+capLabel(marketCap,fdv)+"   · LP "+compact(reserve);
        }
    }

    static final class Snapshot {
        final List<Coin> coins;final long fetchedAt;final String source,diagnostic,error;
        Snapshot(List<Coin> coins,long fetchedAt,String source,String diagnostic,String error){
            this.coins=coins;this.fetchedAt=fetchedAt;this.source=source;this.diagnostic=diagnostic;this.error=error;
        }
        String status(){
            if(fetchedAt==0)return error!=null?"FEED ERROR · never loaded":"Awaiting first market update";
            long age=Math.max(0,System.currentTimeMillis()-fetchedAt)/1000;
            String provider="DEX".equals(source)?"DEX boosts (promoted)":"Gecko trending";
            return (System.currentTimeMillis()-fetchedAt>STALE_MS?"STALE ":"")+provider+
                " · fetched "+age+"s ago"+(error!=null?" · last fetch failed":"");
        }
        String details(){return diagnostic==null||diagnostic.isEmpty()?"No diagnostic recorded":diagnostic;}
    }

    static Snapshot cached(Context c){
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        List<Coin> out=new ArrayList<>();
        try{
            JSONArray a=new JSONArray(p.getString("rows","[]"));
            for(int i=0;i<Math.min(MAX_COINS,a.length());i++){
                JSONObject j=a.getJSONObject(i);
                out.add(new Coin(j.getString("name"),j.getString("identity"),j.getDouble("usd"),
                    j.getDouble("m5"),j.getDouble("h1"),j.getDouble("reserve"),
                    j.getDouble("marketCap"),j.getDouble("fdv"),j.getString("url")));
            }
        }catch(Exception ignored){out.clear();}
        return new Snapshot(out,p.getLong("at",0),p.getString("source",""),
            p.getString("diag",""),p.getString("error",null));
    }

    static synchronized Snapshot refresh(Context c){
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        long now=System.currentTimeMillis();
        if(now-p.getLong("attempt",0)<FETCH_FLOOR_MS)return cached(c);
        p.edit().putLong("attempt",now).apply();
        String geckoProblem="not tried";
        try{
            List<Coin> coins=parseGecko(new JSONObject(getJson(GECKO,true)));
            if(!coins.isEmpty())return save(p,coins,"GECKO","Gecko HTTP 200; "+coins.size()+" unique candidates");
            geckoProblem="Gecko HTTP 200; no qualifying candidates";
        }catch(Exception ex){geckoProblem="Gecko "+problem(ex);}
        try{
            List<String> tokens=boostedSolanaAddresses(new JSONArray(getJson(BOOSTS,false)));
            if(tokens.isEmpty())throw new IllegalStateException("No Solana boost addresses");
            List<Coin> coins=parseDex(new JSONArray(getJson(DEX_TOKENS+join(tokens),false)),new HashSet<>(tokens));
            if(!coins.isEmpty())return save(p,coins,"DEX",geckoProblem+"; DEX 200; "+
                coins.size()+" unique boosted candidates");
            p.edit().putString("error","No eligible pools").putString("diag",
                geckoProblem+"; DEX 200; no qualifying boosted candidates").apply();
        }catch(Exception ex){
            p.edit().putString("error","Feed unavailable")
                .putString("diag",geckoProblem+"; DEX "+problem(ex)).apply();
        }
        return cached(c);
    }

    private static Snapshot save(SharedPreferences p,List<Coin> coins,String source,String diagnostic) throws Exception{
        JSONArray rows=new JSONArray();
        for(Coin coin:coins){
            JSONObject j=new JSONObject();
            j.put("name",coin.name).put("identity",coin.identity).put("usd",coin.usd)
                .put("m5",coin.m5).put("h1",finiteOrNull(coin.h1))
                .put("reserve",coin.reserve).put("marketCap",finiteOrNull(coin.marketCap))
                .put("fdv",finiteOrNull(coin.fdv)).put("url",coin.url);
            rows.put(j);
        }
        long at=System.currentTimeMillis();
        p.edit().putString("rows",rows.toString()).putLong("at",at)
            .putString("source",source).putString("diag",diagnostic).remove("error").apply();
        return new Snapshot(coins,at,source,diagnostic,null);
    }

    private static Object finiteOrNull(double x){return Double.isFinite(x)?x:JSONObject.NULL;}

    private static String getJson(String address,boolean gecko)throws Exception{
        HttpURLConnection conn=null;
        try{
            conn=(HttpURLConnection)new URL(address).openConnection();
            conn.setConnectTimeout(3000);conn.setReadTimeout(3000);
            conn.setRequestProperty("Accept",gecko?"application/json;version=20230203":"application/json");
            conn.setRequestProperty("User-Agent","PocketRadar/0.5 (Android; read-only)");
            int status=conn.getResponseCode();
            if(status!=200)throw new IllegalStateException("HTTP "+status);
            ByteArrayOutputStream b=new ByteArrayOutputStream();
            try(InputStream in=conn.getInputStream()){
                byte[] data=new byte[4096];int len;
                while((len=in.read(data))!=-1){
                    b.write(data,0,len);
                    if(b.size()>MAX_BYTES)throw new IllegalStateException("Response too large");
                }
            }
            return b.toString(StandardCharsets.UTF_8.name());
        }finally{if(conn!=null)conn.disconnect();}
    }

    static List<Coin> parseGecko(JSONObject json){
        JSONArray pools=json.optJSONArray("data");
        if(pools==null)throw new IllegalArgumentException("Missing pool data array");
        Map<String,String> mintById=new HashMap<>();
        JSONArray included=json.optJSONArray("included");
        if(included!=null){
            for(int i=0;i<included.length();i++){
                JSONObject item=included.optJSONObject(i);
                if(item==null||!"token".equals(item.optString("type")))continue;
                JSONObject attrs=item.optJSONObject("attributes");
                String address=attrs==null?"":attrs.optString("address","");
                if(isSolanaAddress(address))mintById.put(item.optString("id",""),address);
            }
        }
        // Preserve provider trend order; if the same token appears in several pools,
        // prefer its deeper qualified pool without allowing it to occupy another slot.
        LinkedHashMap<String,Coin> best=new LinkedHashMap<>();
        for(int i=0;i<pools.length();i++){
            JSONObject item=pools.optJSONObject(i);
            JSONObject a=item==null?null:item.optJSONObject("attributes");
            if(a==null)continue;
            String pool=a.optString("address","");
            if(!isSolanaAddress(pool))continue;
            double liquidity=number(a.opt("reserve_in_usd"));
            double price=number(a.opt("base_token_price_usd"));
            JSONObject changes=a.optJSONObject("price_change_percentage");
            double m5=changes==null?Double.NaN:number(changes.opt("m5"));
            double h1=changes==null?Double.NaN:number(changes.opt("h1"));
            if(!eligible(liquidity,price,m5))continue;
            String identity=geckoBaseIdentity(item,mintById,pool);
            String label=safeName(a.optString("name","Unknown").split(" / ")[0]);
            Coin c=new Coin(label,identity,price,m5,h1,liquidity,
                number(a.opt("market_cap_usd")),number(a.opt("fdv_usd")),
                "https://www.geckoterminal.com/solana/pools/"+pool);
            Coin previous=best.get(identity);
            if(previous==null||liquidity>previous.reserve)best.put(identity,c);
        }
        return uniqueLabelsAndLimit(new ArrayList<>(best.values()));
    }

    /** Base-token relation is immutable provider identity; suffix is extracted only if valid Solana mint. */
    static String geckoBaseIdentity(JSONObject pool,Map<String,String> included,String poolAddress){
        JSONObject relations=pool.optJSONObject("relationships");
        JSONObject base=relations==null?null:relations.optJSONObject("base_token");
        JSONObject data=base==null?null:base.optJSONObject("data");
        String id=data==null?"":data.optString("id","");
        if(!id.isEmpty()){
            String mint=included.get(id);
            if(isSolanaAddress(mint))return "mint:"+mint;
            if(id.startsWith("solana_")){
                String candidate=id.substring("solana_".length());
                if(isSolanaAddress(candidate))return "mint:"+candidate;
            }
            // Provider's relationship ID can deduplicate pools even when its mint
            // address representation is unfamiliar. Do not claim it is a verified mint.
            return "relationship:"+id;
        }
        // No relationship: pool remains distinct and cannot be treated as verified token dedup.
        return "pool:"+poolAddress;
    }

    static List<String> boostedSolanaAddresses(JSONArray boosts){
        List<String> results=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(int i=0;i<boosts.length()&&results.size()<25;i++){
            JSONObject row=boosts.optJSONObject(i);
            if(row==null||!"solana".equalsIgnoreCase(row.optString("chainId")))continue;
            String mint=row.optString("tokenAddress","");
            if(isSolanaAddress(mint)&&seen.add(mint))results.add(mint);
        }
        return results;
    }

    static List<Coin> parseDex(JSONArray pairs,Set<String> requested){
        Map<String,Coin> best=new HashMap<>();
        for(int i=0;i<pairs.length();i++){
            JSONObject pair=pairs.optJSONObject(i);
            if(pair==null||!"solana".equalsIgnoreCase(pair.optString("chainId")))continue;
            String pool=pair.optString("pairAddress","");
            JSONObject token=pair.optJSONObject("baseToken");
            if(token==null||!isSolanaAddress(pool))continue;
            String mint=token.optString("address","");
            if(!requested.contains(mint))continue;
            JSONObject liq=pair.optJSONObject("liquidity");
            JSONObject change=pair.optJSONObject("priceChange");
            double liquidity=liq==null?Double.NaN:number(liq.opt("usd"));
            double usd=number(pair.opt("priceUsd"));
            double m5=change==null?Double.NaN:number(change.opt("m5"));
            if(!eligible(liquidity,usd,m5))continue;
            double h1=change==null?Double.NaN:number(change.opt("h1"));
            Coin c=new Coin(safeName(token.optString("symbol",token.optString("name","Unknown"))),
                "mint:"+mint,usd,m5,h1,liquidity,number(pair.opt("marketCap")),
                number(pair.opt("fdv")),"https://dexscreener.com/solana/"+pool);
            Coin previous=best.get(mint);
            if(previous==null||c.reserve>previous.reserve)best.put(mint,c);
        }
        List<Coin> out=new ArrayList<>(best.values());
        Collections.sort(out,(a,b)->Double.compare(b.m5,a.m5));
        return uniqueLabelsAndLimit(out);
    }

    /** Different mints with same symbol are separate assets; add a short identity hint. */
    static List<Coin> uniqueLabelsAndLimit(List<Coin> ranked){
        Map<String,Integer> names=new HashMap<>();
        for(Coin c:ranked)names.put(c.name.toLowerCase(Locale.ROOT),
            1+names.getOrDefault(c.name.toLowerCase(Locale.ROOT),0));
        ArrayList<Coin> out=new ArrayList<>();
        for(Coin c:ranked){
            if(out.size()>=MAX_COINS)break;
            String display=c.name;
            if(names.get(c.name.toLowerCase(Locale.ROOT))>1){
                String key=c.identity;
                String suffix=key.length()>4?key.substring(key.length()-4):key;
                display=c.name+"·"+suffix;
            }
            out.add(new Coin(display,c.identity,c.usd,c.m5,c.h1,c.reserve,c.marketCap,c.fdv,c.url));
        }
        return out;
    }

    static boolean eligible(double reserve,double usd,double m5){
        return Double.isFinite(reserve)&&reserve>=RESERVE_FLOOR&&
            Double.isFinite(usd)&&usd>0&&Double.isFinite(m5);
    }
    static double number(Object v){
        try{return Double.parseDouble(String.valueOf(v));}
        catch(Exception ex){return Double.NaN;}
    }
    static String capLabel(double mcap,double fdv){
        if(Double.isFinite(mcap)&&mcap>0)return "MC "+compact(mcap);
        if(Double.isFinite(fdv)&&fdv>0)return "MC —  FDV "+compact(fdv);
        return "MC —";
    }
    static String formatMove(double n){
        if(!Double.isFinite(n))return "—";
        if(Math.abs(n)<0.05)n=0;
        return String.format(Locale.US,"%+.1f%%",n);
    }
    static String formatPrice(double n){
        return n>=1?String.format(Locale.US,"$%.3f",n)
            :n>=0.01?String.format(Locale.US,"$%.4f",n)
            :n>=0.0001?String.format(Locale.US,"$%.6f",n)
            :String.format(Locale.US,"$%.9f",n);
    }
    private static boolean isSolanaAddress(String s){
        return s!=null&&s.matches("[1-9A-HJ-NP-Za-km-z]{32,44}");
    }
    private static String problem(Exception ex){
        String msg=ex.getMessage();
        if(ex instanceof java.net.UnknownHostException)return "DNS lookup failed";
        if(ex instanceof java.net.SocketTimeoutException)return "connection timed out";
        if(ex instanceof javax.net.ssl.SSLException)return "TLS handshake failed";
        if(msg!=null&&msg.matches("HTTP [0-9]{3}"))return msg;
        return ex.getClass().getSimpleName();
    }
    private static String join(List<String> a){
        StringBuilder b=new StringBuilder();
        for(String s:a){if(b.length()>0)b.append(',');b.append(s);}
        return b.toString();
    }
    private static String safeName(String s){
        s=s==null?"Unknown":s.trim();
        if(s.isEmpty())s="Unknown";
        return s.length()>12?s.substring(0,12):s;
    }
    static String compact(double n){
        if(!Double.isFinite(n)||n<=0)return "—";
        return n>=1_000_000_000?String.format(Locale.US,"$%.1fb",n/1e9)
            :n>=1_000_000?String.format(Locale.US,"$%.1fm",n/1e6)
            :n>=1000?String.format(Locale.US,"$%.0fk",n/1000)
            :String.format(Locale.US,"$%.0f",n);
    }
    private RadarRepository(){}
}
