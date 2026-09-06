'use client';
import { useProgressFeed, ReportFrame, LoadingBody, TelatBody } from '@/components/progress/kit';

export default function ProgressTelatPage() {
  const { feed, now, secsAgo, live } = useProgressFeed();
  return (
    <ReportFrame slug="telat" now={now} live={live} secsAgo={secsAgo}>
      {feed ? <TelatBody feed={feed} /> : <LoadingBody />}
    </ReportFrame>
  );
}
