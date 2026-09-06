'use client';
import { useProgressFeed, ReportFrame, LoadingBody, RejectBody } from '@/components/progress/kit';

export default function ProgressRejectPage() {
  const { feed, now, secsAgo, live } = useProgressFeed();
  return (
    <ReportFrame slug="reject" now={now} live={live} secsAgo={secsAgo}>
      {feed ? <RejectBody feed={feed} /> : <LoadingBody />}
    </ReportFrame>
  );
}
