package dev.whatsgood.pocketradar;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

public final class RadarRefreshJob extends JobService {
    private static final int ID = 901;
    private Runnable completion;

    static void enqueue(Context context, boolean manual) {
        if (LiveRadarService.isRunning()) {
            if (manual) LiveRadarService.refreshNow();
            return;
        }
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler.getPendingJob(ID) != null || RadarUpdates.checking()) return;
        ComponentName service = new ComponentName(context, RadarRefreshJob.class);
        JobInfo.Builder job = new JobInfo.Builder(ID, service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        if (manual && Build.VERSION.SDK_INT >= 31
                && scheduler.schedule(job.setExpedited(true).build()) == JobScheduler.RESULT_SUCCESS) return;
        scheduler.schedule(new JobInfo.Builder(ID, service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).build());
    }

    @Override public boolean onStartJob(JobParameters params) {
        if (LiveRadarService.isRunning()) return false;
        completion = () -> {
            completion = null;
            jobFinished(params, false);
        };
        if (RadarUpdates.request(this, completion)) return true;
        completion = null;
        return false;
    }

    @Override public boolean onStopJob(JobParameters params) {
        RadarUpdates.cancelCompletion(completion);
        completion = null;
        return false;
    }
}
