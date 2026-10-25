package dev.whatsgood.pocketradar;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import static org.junit.Assert.*;

public class RadarRepositoryTest {
    private static final String MINT="So11111111111111111111111111111111111111112";
    private static final String PAIR="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    @Test public void validGeckoPoolIsVisible() throws Exception {
        JSONObject pool=new JSONObject().put("attributes",new JSONObject()
            .put("address",PAIR).put("name","Sample / SOL")
            .put("reserve_in_usd","62000").put("base_token_price_usd","0.002")
            .put("price_change_percentage",new JSONObject().put("m5","4.8")));
        List<RadarRepository.Coin> result=RadarRepository.parseGecko(
            new JSONObject().put("data",new JSONArray().put(pool)));
        assertEquals(1,result.size());
        assertEquals("Sample",result.get(0).name);
        assertTrue(result.get(0).url.contains(PAIR));
    }
    @Test public void reserveFilterRejectsLowLiquidity() throws Exception {
        JSONObject pool=new JSONObject().put("attributes",new JSONObject()
            .put("address",PAIR).put("name","Low / SOL")
            .put("reserve_in_usd","49").put("base_token_price_usd","0.2")
            .put("price_change_percentage",new JSONObject().put("m5","55")));
        assertTrue(RadarRepository.parseGecko(
            new JSONObject().put("data",new JSONArray().put(pool))).isEmpty());
    }
    @Test(expected=IllegalArgumentException.class)
    public void missingDataIsAnErrorNotAnEmptyMarket() {
        RadarRepository.parseGecko(new JSONObject());
    }
    @Test public void dexFallbackRequiresExactMintAndDeepPair() throws Exception {
        JSONObject pair=new JSONObject()
            .put("chainId","solana").put("pairAddress",PAIR)
            .put("baseToken",new JSONObject().put("address",MINT).put("symbol","EXAMPLE"))
            .put("priceUsd","0.012")
            .put("liquidity",new JSONObject().put("usd",78000))
            .put("priceChange",new JSONObject().put("m5",-2.4));
        Set<String> selected=new HashSet<>();selected.add(MINT);
        assertEquals(1,RadarRepository.parseDex(new JSONArray().put(pair),selected).size());
        selected.clear();
        assertTrue(RadarRepository.parseDex(new JSONArray().put(pair),selected).isEmpty());
    }
    @Test public void boostCandidatesKeepOnlyExactSolanaTokens() throws Exception {
        JSONArray promotions=new JSONArray().put(new JSONObject()
            .put("chainId","solana").put("tokenAddress",MINT))
            .put(new JSONObject().put("chainId","ethereum").put("tokenAddress",MINT))
            .put(new JSONObject().put("chainId","solana").put("tokenAddress",MINT))
            .put(new JSONObject().put("chainId","solana").put("tokenAddress","not-an-address"));
        assertEquals(1,RadarRepository.boostedSolanaAddresses(promotions).size());
    }
    @Test public void nonFiniteQuotesAreRejected() {
        assertFalse(RadarRepository.eligible(60000,Double.NaN,50));
        assertFalse(RadarRepository.eligible(60000,0,50));
        assertFalse(RadarRepository.eligible(49999,0.2,12));
    }
    @Test public void geckoSameMintAcrossPoolsConsumesOneSlotAndChoosesDeeperPool() throws Exception {
        String sameMint="So11111111111111111111111111111111111111112";
        String pool2="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        JSONObject first=geckoPool(PAIR,"BILLIONS / SOL",65000,"0.0023","24.2","45.8",null)
            .put("relationships",new JSONObject().put("base_token",new JSONObject()
                .put("data",new JSONObject().put("id","solana_"+sameMint))));
        JSONObject second=geckoPool(pool2,"BILLIONS / SOL",88000,"0.0024","-10.9","-15.0","123000")
            .put("relationships",new JSONObject().put("base_token",new JSONObject()
                .put("data",new JSONObject().put("id","solana_"+sameMint))));
        JSONObject feed=new JSONObject().put("data",new JSONArray().put(first).put(second));
        List<RadarRepository.Coin> found=RadarRepository.parseGecko(feed);
        assertEquals(1,found.size());
        assertTrue(found.get(0).url.contains(pool2));
        assertEquals("mint:"+sameMint,found.get(0).identity);
        assertEquals(-10.9,found.get(0).m5,0.000001);
        assertEquals(-15.0,found.get(0).h1,0.000001);
        assertEquals(123000,found.get(0).marketCap,0.000001);
    }
    @Test public void sameTickerDifferentMintsRemainsTwoRowsWithIdentityHints() throws Exception {
        String mint1="So11111111111111111111111111111111111111112";
        String mint2="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        JSONObject first=geckoPool(PAIR,"BILLIONS / SOL",65000,"0.0023","24.2","0.5",null)
            .put("relationships",new JSONObject().put("base_token",new JSONObject()
                .put("data",new JSONObject().put("id","solana_"+mint1))));
        JSONObject second=geckoPool(mint2,"BILLIONS / SOL",88000,"0.0024","-10.9","-15.0",null)
            .put("relationships",new JSONObject().put("base_token",new JSONObject()
                .put("data",new JSONObject().put("id","solana_"+mint2))));
        List<RadarRepository.Coin> found=RadarRepository.parseGecko(
            new JSONObject().put("data",new JSONArray().put(first).put(second)));
        assertEquals(2,found.size());
        assertNotEquals(found.get(0).identity,found.get(1).identity);
        assertTrue(found.get(0).name.contains("·"));
        assertTrue(found.get(1).name.contains("·"));
    }
    @Test public void unknownMarketCapNotInventedFromFdv() throws Exception {
        JSONObject p=geckoPool(PAIR,"Sample / SOL",95000,"0.08","4.2",null,null);
        JSONObject attrs=p.getJSONObject("attributes");
        attrs.put("fdv_usd","250000");
        List<RadarRepository.Coin> found=RadarRepository.parseGecko(
            new JSONObject().put("data",new JSONArray().put(p)));
        assertEquals(1,found.size());
        assertTrue(Double.isNaN(found.get(0).marketCap));
        assertTrue(Double.isNaN(found.get(0).h1));
        assertTrue(found.get(0).line().contains("MC —  FDV $250k"));
        assertTrue(found.get(0).line().contains("1h —"));
    }
    @Test public void geckoIncludedIdentityOverridesNoncanonicalRelationshipId() throws Exception {
        JSONObject pool=geckoPool(PAIR,"Thing / SOL",81000,"0.04","9.4","18.0","90000");
        pool.put("relationships",new JSONObject().put("base_token",
            new JSONObject().put("data",new JSONObject().put("id","my-token-id"))));
        JSONObject included=new JSONObject().put("type","token").put("id","my-token-id")
            .put("attributes",new JSONObject().put("address",MINT));
        List<RadarRepository.Coin> found=RadarRepository.parseGecko(
            new JSONObject().put("data",new JSONArray().put(pool))
                .put("included",new JSONArray().put(included)));
        assertEquals("mint:"+MINT,found.get(0).identity);
    }
    @Test public void displayedPercentageZeroIsNotNegativeZero() {
        assertEquals("+0.0%",RadarRepository.formatMove(-0.01));
        assertEquals("—",RadarRepository.formatMove(Double.NaN));
    }
    private static JSONObject geckoPool(String address,String name,double reserve,
        String price,String m5,String h1,String mcap) throws Exception {
        JSONObject attr=new JSONObject().put("address",address).put("name",name)
            .put("reserve_in_usd",reserve).put("base_token_price_usd",price);
        JSONObject changes=new JSONObject().put("m5",m5);
        if(h1!=null)changes.put("h1",h1);
        attr.put("price_change_percentage",changes);
        if(mcap!=null)attr.put("market_cap_usd",mcap);
        return new JSONObject().put("attributes",attr);
    }

    @Test public void chaseModeUsesPoolAgeReportedTradeCountsAndVerifiedArithmetic() {
        long now=1_800_000_000_000L;
        RadarRepository.Coin good=new RadarRepository.Coin("EARLY","mint:early",
            0.01,8,12,80000,200000,200000,"https://www.geckoterminal.com/solana/pools/test",
            24,10,now-2*3600_000L);
        RadarRepository.Coin less=new RadarRepository.Coin("SECOND","mint:second",
            0.02,5,7,81000,200000,200000,"https://www.geckoterminal.com/solana/pools/other",
            13,6,now-4*3600_000L);
        assertTrue(ChaseRanker.qualifies(good,now));
        assertTrue(ChaseRanker.qualifies(less,now));
        List<RadarRepository.Coin> selected=RadarRepository.select(
            java.util.Arrays.asList(less,good),RadarRepository.CHASE,now);
        assertEquals(2,selected.size());
        assertEquals("EARLY",selected.get(0).name);
        assertTrue(selected.get(0).widgetLine(RadarRepository.CHASE).contains("buys/sells 24/10"));
        assertEquals("SECOND",RadarRepository.select(
            java.util.Arrays.asList(less,good),RadarRepository.TREND,now).get(0).name);
    }
    @Test public void chaseRejectsUnknownTradeDataOldPoolsAndParabolicMoves(){
        long now=1_800_000_000_000L;
        RadarRepository.Coin missing=new RadarRepository.Coin("NO TX","mint:tx",
            0.01,8,12,90000,200000,200000,"https://geckoterminal.com", -1,-1,now-3600_000L);
        RadarRepository.Coin old=new RadarRepository.Coin("OLD","mint:old",
            0.01,8,12,90000,200000,200000,"https://geckoterminal.com", 20,3,now-100L*3600_000L);
        RadarRepository.Coin parabolic=new RadarRepository.Coin("HIGH","mint:high",
            0.01,150,270,90000,200000,200000,"https://geckoterminal.com", 20,3,now-3600_000L);
        RadarRepository.Coin sellers=new RadarRepository.Coin("SELLERS","mint:sellers",
            0.01,6,10,90000,200000,200000,"https://geckoterminal.com", 20,50,now-3600_000L);
        for(RadarRepository.Coin c:java.util.Arrays.asList(missing,old,parabolic,sellers)){
            assertFalse(c.name,ChaseRanker.qualifies(c,now));
        }
        assertTrue(RadarRepository.select(java.util.Arrays.asList(missing,old,parabolic,sellers),
            RadarRepository.CHASE,now).isEmpty());
    }
    @Test public void parseGeckoReadsFiveMinuteTransactionsAndPoolCreation()throws Exception{
        JSONObject p=geckoPool(PAIR,"EARLY / SOL",80000,"0.002","5.0","12.0","180000");
        p.getJSONObject("attributes")
            .put("pool_created_at","2026-10-25T10:30:00Z")
            .put("transactions",new JSONObject().put("m5",new JSONObject()
                .put("buys",44).put("sells",12)));
        List<RadarRepository.Coin> parsed=RadarRepository.parseGecko(
            new JSONObject().put("data",new JSONArray().put(p)));
        assertEquals(44,parsed.get(0).buys5);
        assertEquals(12,parsed.get(0).sells5);
        assertEquals(java.time.Instant.parse("2026-10-25T10:30:00Z").toEpochMilli(),
            parsed.get(0).createdAt);
    }
    @Test public void unknownPoolAgeOrMalformedDateIsNotInvented(){
        assertEquals(0,RadarRepository.parsePoolCreatedAt("not a date"));
        assertEquals("age ?",RadarRepository.ageLabel(0,1_800_000_000_000L));
        assertEquals("age ?",RadarRepository.ageLabel(1_900_000_000_000L,1_800_000_000_000L));
        assertEquals("2h",RadarRepository.ageLabel(1_800_000_000_000L-2*3600_000L,1_800_000_000_000L));
    }
    @Test public void modeNeverChangesChartLink(){
        long now=1_800_000_000_000L;
        String url="https://www.geckoterminal.com/solana/pools/"+PAIR;
        RadarRepository.Coin coin=new RadarRepository.Coin("HOLD","mint:hold",
            0.01,5,9,60000,300000,300000,url,15,8,now-3600_000L);
        assertEquals(url,RadarRepository.select(java.util.Collections.singletonList(coin),
            RadarRepository.TREND,now).get(0).url);
        assertEquals(url,RadarRepository.select(java.util.Collections.singletonList(coin),
            RadarRepository.CHASE,now).get(0).url);
    }

}
