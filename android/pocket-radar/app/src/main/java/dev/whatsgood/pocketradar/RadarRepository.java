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
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Public market-data demo. No wallet permissions, private GOGET keys or trading. */
final class RadarRepository {
    static final String DASHBOARD="https://buyguy-free-radar.wessteven.workers.dev/dashboard";
    private static final String GECKO="https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?duration=5m";
    private static final String BOOSTS="https://api.dexscreener.com/token-boosts/top/v1";
    private static final String DEX_TOKENS="https://api.dexscreener.com/tokens/v1/solana/";
    private static final String PREFS="pocket-radar-v03";
    private static final long FETCH_FLOOR_MS=60_000L, STALE_MS=5*60_000L;
    private static final double RESERVE_FLOOR=50_000;
    private static final int MAX_BYTES=950_000;

    static final class Coin {
        final String name,price,change,url;
        final double m5,reserve;
        Coin(String name,String price,String change,double m5,double reserve,String url) {
            this.name=name;this.price=price;this.change=change;this.m5=m5;this.reserve=reserve;this.url=url;
        }
        String line(){return name+"   "+price+"   "+change+"   · L "+compact(reserve);}
    }

    static final class Snapshot {
        final List<Coin> coins;
        final long fetchedAt;
        final String source, diagnostic, error;
        Snapshot(List<Coin> c,long at,String source,String diagnostic,String error) {
            coins=c;fetchedAt=at;this.source=source;this.diagnostic=diagnostic;this.error=error;
        }
        String status(){
            if(fetchedAt==0) return error!=null?"FEED ERROR · never loaded":"Awaiting first market update";
            long age=Math.max(0,System.currentTimeMillis()-fetchedAt)/1000;
            boolean stale=System.currentTimeMillis()-fetchedAt>STALE_MS;
            String prefix=stale?"STALE ":"";
            String provider="DEX".equals(source)?"DEX boosts (promoted)":"Gecko trending";
            return prefix+provider+" · fetched "+age+"s ago"+(error!=null?" · last fetch failed":"");
        }
        String details(){
            return diagnostic==null||diagnostic.isEmpty()?"No diagnostic recorded":diagnostic;
        }
    }

    static Snapshot cached(Context c) {
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        List<Coin> out=new ArrayList<>();
        try{
            JSONArray data=new JSONArray(p.getString("rows","[]"));
            for(int i=0;i<Math.min(5,data.length());i++){
                JSONObject j=data.getJSONObject(i);
                out.add(new Coin(j.getString("name"),j.getString("price"),j.getString("change"),
                    j.getDouble("m5"),j.getDouble("reserve"),j.getString("url")));
            }
        }catch(Exception ignored){out.clear();}
        return new Snapshot(out,p.getLong("at",0),p.getString("source",""),
                p.getString("diag",""),p.getString("error",null));
    }

    /** Throttled even on failure. Never overwrite a successful cache with invented values. */
    static synchronized Snapshot refresh(Context c) {
        SharedPreferences p=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        long now=System.currentTimeMillis();
        if(now-p.getLong("attempt",0)<FETCH_FLOOR_MS) return cached(c);
        p.edit().putLong("attempt",now).apply();
        String geckoProblem="not tried";
        try{
            JSONObject gecko=new JSONObject(getJson(GECKO,true));
            List<Coin> coins=parseGecko(gecko);
            if(!coins.isEmpty())return save(p,coins,"GECKO","Gecko HTTP 200; "+coins.size()+" eligible pools");
            geckoProblem="Gecko HTTP 200; no eligible pools";
        }catch(Exception ex){geckoProblem="Gecko "+problem(ex);}
        try{
            JSONArray boosts=new JSONArray(getJson(BOOSTS,false));
            List<String> tokens=boostedSolanaAddresses(boosts);
            if(tokens.isEmpty())throw new IllegalStateException("No Solana boost addresses");
            JSONArray pairs=new JSONArray(getJson(DEX_TOKENS+join(tokens),false));
            List<Coin> coins=parseDex(pairs,new HashSet<>(tokens));
            if(!coins.isEmpty())return save(p,coins,"DEX",geckoProblem+"; DEX 200; "+coins.size()+" eligible boosted");
            String error=geckoProblem+"; DEX 200; no eligible boosted pools";
            p.edit().putString("error","No eligible pools").putString("diag",error).apply();
        }catch(Exception ex){
            String error=geckoProblem+"; DEX "+problem(ex);
            p.edit().putString("error","Feed unavailable").putString("diag",error).apply();
        }
        return cached(c);
    }

    private static Snapshot save(SharedPreferences p,List<Coin> coins,String source,String diagnostic) throws Exception {
        JSONArray data=new JSONArray();
        for(Coin coin:coins){
            JSONObject j=new JSONObject();
            j.put("name",coin.name);j.put("price",coin.price);j.put("change",coin.change);
            j.put("m5",coin.m5);j.put("reserve",coin.reserve);j.put("url",coin.url);
            data.put(j);
        }
        long time=System.currentTimeMillis();
        p.edit().putString("rows",data.toString()).putLong("at",time)
            .putString("source",source).putString("diag",diagnostic).remove("error").apply();
        return new Snapshot(coins,time,source,diagnostic,null);
    }

    private static String getJson(String address,boolean gecko) throws Exception {
        HttpURLConnection connection=null;
        try {
            connection=(HttpURLConnection)new URL(address).openConnection();
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            connection.setRequestProperty("Accept",gecko?"application/json;version=20230203":"application/json");
            connection.setRequestProperty("User-Agent","PocketRadar/0.3 (Android; read-only)");
            int status=connection.getResponseCode();
            if(status!=200) throw new IllegalStateException("HTTP "+status);
            ByteArrayOutputStream buffer=new ByteArrayOutputStream();
            try(InputStream stream=connection.getInputStream()){
                byte[] bytes=new byte[4096];int n;
                while((n=stream.read(bytes))!=-1){
                    buffer.write(bytes,0,n);
                    if(buffer.size()>MAX_BYTES) throw new IllegalStateException("Response too large");
                }
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        }finally{if(connection!=null)connection.disconnect();}
    }

    static List<Coin> parseGecko(JSONObject json) {
        ArrayList<Coin> result=new ArrayList<>();
        JSONArray data=json.optJSONArray("data");
        if(data==null)throw new IllegalArgumentException("Missing pool data array");
        for(int i=0;i<data.length()&&result.size()<5;i++){
            JSONObject pool=data.optJSONObject(i);
            JSONObject attr=pool==null?null:pool.optJSONObject("attributes");
            if(attr==null)continue;
            String address=attr.optString("address","");
            if(!isSolanaAddress(address))continue;
            double reserve=number(attr.opt("reserve_in_usd"));
            double usd=number(attr.opt("base_token_price_usd"));
            JSONObject changes=attr.optJSONObject("price_change_percentage");
            double m5=changes==null?Double.NaN:number(changes.opt("m5"));
            if(!eligible(reserve,usd,m5))continue;
            String name=safeName(attr.optString("name","Unknown").split(" / ")[0]);
            result.add(new Coin(name,formatPrice(usd),formatMove(m5),m5,reserve,
                "https://www.geckoterminal.com/solana/pools/"+address));
        }
        return result;
    }

    /** Paid-promotion list; never present this as independent discovery or risk scoring. */
    static List<String> boostedSolanaAddresses(JSONArray boosts) {
        List<String> results=new ArrayList<>();
        Set<String> seen=new HashSet<>();
        for(int i=0;i<boosts.length()&&results.size()<25;i++){
            JSONObject row=boosts.optJSONObject(i);
            if(row==null||!"solana".equalsIgnoreCase(row.optString("chainId")))continue;
            String address=row.optString("tokenAddress","");
            if(isSolanaAddress(address)&&seen.add(address))results.add(address);
        }
        return results;
    }

    static List<Coin> parseDex(JSONArray pairs,Set<String> requested) {
        Map<String,Coin> best=new HashMap<>();
        for(int i=0;i<pairs.length();i++){
            JSONObject pair=pairs.optJSONObject(i);
            if(pair==null||!"solana".equalsIgnoreCase(pair.optString("chainId")))continue;
            String address=pair.optString("pairAddress","");
            JSONObject token=pair.optJSONObject("baseToken");
            if(token==null||!isSolanaAddress(address))continue;
            String mint=token.optString("address","");
            if(!requested.contains(mint))continue;
            JSONObject liq=pair.optJSONObject("liquidity");
            JSONObject change=pair.optJSONObject("priceChange");
            double reserve=liq==null?Double.NaN:number(liq.opt("usd"));
            double usd=number(pair.opt("priceUsd"));
            double m5=change==null?Double.NaN:number(change.opt("m5"));
            if(!eligible(reserve,usd,m5))continue;
            String label=safeName(token.optString("symbol",token.optString("name","Unknown")));
            Coin coin=new Coin(label,formatPrice(usd),formatMove(m5),m5,reserve,
                "https://dexscreener.com/solana/"+address);
            Coin prev=best.get(mint);
            if(prev==null||coin.reserve>prev.reserve)best.put(mint,coin);
        }
        ArrayList<Coin> result=new ArrayList<>(best.values());
        Collections.sort(result,(a,b)->Double.compare(b.m5,a.m5));
        return new ArrayList<>(result.subList(0,Math.min(5,result.size())));
    }

    static boolean eligible(double reserve,double usd,double m5){
        return Double.isFinite(reserve)&&reserve>=RESERVE_FLOOR&&
            Double.isFinite(usd)&&usd>0&&Double.isFinite(m5);
    }
    private static boolean isSolanaAddress(String s){
        return s!=null&&s.matches("[1-9A-HJ-NP-Za-km-z]{32,44}");
    }
    private static double number(Object v){
        try{return Double.parseDouble(String.valueOf(v));}
        catch(Exception ex){return Double.NaN;}
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
        return s.length()>14?s.substring(0,14):s;
    }
    private static String formatPrice(double n){
        return n>=1?String.format(Locale.US,"$%.3f",n)
            :n>=0.01?String.format(Locale.US,"$%.4f",n)
            :n>=0.0001?String.format(Locale.US,"$%.6f",n)
            :String.format(Locale.US,"$%.9f",n);
    }
    private static String formatMove(double n){
        return String.format(Locale.US,"%+.1f%%",n);
    }
    private static String compact(double n){
        return n>=1_000_000?String.format(Locale.US,"$%.1fm",n/1_000_000)
            :n>=1000?String.format(Locale.US,"$%.0fk",n/1000):String.format(Locale.US,"$%.0f",n);
    }
    private RadarRepository(){}
}
