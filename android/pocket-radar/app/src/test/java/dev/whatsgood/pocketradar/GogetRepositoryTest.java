package dev.whatsgood.pocketradar;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class GogetRepositoryTest{
    private static final String MINT="So11111111111111111111111111111111111111112";
    private static final String POOL="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    private JSONObject coin() throws Exception{
        return new JSONObject().put("assetKey","solana:"+MINT).put("mint",MINT)
           .put("pool",POOL).put("symbol","TEST").put("priceUsd",0.001)
           .put("marketCapUsd",90000).put("liquidityUsd",80000)
           .put("ourScore",68.5).put("buys5",14).put("sells5",6)
           .put("quoteObservedAt","2026-10-27T10:00:00.000Z")
           .put("buyerEvidence","reported_transactions_only")
           .put("verifiedUniqueBuyers",JSONObject.NULL)
           .put("greenStatus","PARTIAL").put("greenPassed",2)
           .put("lpLockVerified",false);
    }
    private String response(JSONObject candidate)throws Exception{
        return new JSONObject().put("schema","goget-pocket-v1")
            .put("source","GOGET_D1_RESEARCH")
            .put("generatedAt","2026-10-27T10:00:00.000Z")
            .put("sample",new JSONObject().put("assets",8).put("assetLimit",80))
            .put("coins",new JSONArray().put(candidate)).toString();
    }
    @Test public void validResponseIsNotConflatedWithGeckoTrending()throws Exception{
        GogetRepository.Snapshot snapshot=GogetRepository.decode(response(coin()),12345L,null);
        assertEquals(1,snapshot.coins.size());
        assertEquals(68.5,snapshot.coins.get(0).score,0.001);
        assertEquals("reported_transactions_only",snapshot.coins.get(0).buyerEvidence);
        assertTrue(snapshot.coins.get(0).chart.endsWith(POOL));
        assertFalse(snapshot.coins.get(0).lpLock);
        assertEquals(12345L,snapshot.fetchedAt);
    }
    @Test public void rejectsInventedMintOrPoolAndFakeVerifiedBuyers()throws Exception{
        assertEquals(0,GogetRepository.decode(response(coin().put("assetKey","solana:wrong")),1,null).coins.size());
        assertEquals(0,GogetRepository.decode(response(coin().put("pool","not-a-pool")),1,null).coins.size());
        assertEquals(0,GogetRepository.decode(response(coin().put("verifiedUniqueBuyers",20)),1,null).coins.size());
        assertEquals(0,GogetRepository.decode(response(coin().put("buyerEvidence","wallet_verified")),1,null).coins.size());
    }
    @Test public void rejectsUnknownSchemaUnboundedRankAndUnsafeScore()throws Exception{
        JSONObject root=new JSONObject(response(coin()));
        root.put("schema","gecko-trending");
        assertEquals(0,GogetRepository.decode(root.toString(),1,null).coins.size());
        root=new JSONObject(response(coin().put("ourScore",220)));
        assertEquals(0,GogetRepository.decode(root.toString(),1,null).coins.size());
        root=new JSONObject(response(coin()));
        root.getJSONObject("sample").put("assetLimit",50000);
        assertEquals(0,GogetRepository.decode(root.toString(),1,null).coins.size());
    }
}
