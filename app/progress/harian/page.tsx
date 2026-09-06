'use client';
import { useProgressFeed, ReportFrame, LoadingBody, PoinSlaBody } from '@/components/progress/kit';

export default function ProgressHarianPage() {
  const { feed, now, secsAgo, live } = useProgressFeed();
  return (
    <ReportFrame slug="harian" now={now} live={live} secsAgo={secsAgo}>
      {feed ? <PoinSlaBody feed={feed} /> : <LoadingBody />}
    </ReportFrame>
  );
}
