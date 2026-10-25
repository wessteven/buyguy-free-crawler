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
}
