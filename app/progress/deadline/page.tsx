'use client';
import { useProgressFeed, ReportFrame, LoadingBody, DeadlineBody } from '@/components/progress/kit';

export default function ProgressDeadlinePage() {
  const { feed, now, secsAgo, live } = useProgressFeed();
  return (
    <ReportFrame slug="deadline" now={now} live={live} secsAgo={secsAgo}>
      {feed ? <DeadlineBody feed={feed} /> : <LoadingBody />}
    </ReportFrame>
  );
}
