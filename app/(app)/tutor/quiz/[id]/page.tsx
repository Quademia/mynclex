// mynclex/app/(app)/tutor/quiz/[id]/page.tsx
//
// Quiz editor URL handler (Tutor Quiz Slice 1). Fetches the quiz +
// its ordered question list, plus the filtered picker question pool
// (from searchParams), and mounts <QuizEditor> for the interactive
// body. 404s when the quiz doesn't exist or belongs to another
// tutor (RLS turns the lookup into null).
//
// URL: /tutor/quiz/<quiz_id>?type=&category=&difficulty=&q=

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getQuizDetail,
  getPickerQuestions,
  getPickerTagOptions,
  getQuizActivityLinks,
  getQuizProgrammes,
} from '@/lib/tutor-quiz/queries';
import { QuizEditor } from '@/lib/tutor-quiz/quiz-editor';
import { parseQuizPickerFilters } from '@/lib/tutor-quiz/quiz-picker-query';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
}

export default async function TutorQuizEditorPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const filters = parseQuizPickerFilters(sp);

  const detail = await getQuizDetail(id);
  if (!detail) notFound();

  const [pickerQuestions, tagOptions, programmes, activityLinks] =
    await Promise.all([
      getPickerQuestions(filters),
      getPickerTagOptions(),
      getQuizProgrammes(id),
      getQuizActivityLinks(id),
    ]);

  // Map the (richer) activity-link shape down to the card-badge ref the
  // shared QuizCardBadges peek expects.
  const activities = activityLinks.map((a) => ({
    activity_id: a.activity_id,
    title: a.activity_title,
    programme_title: a.programme_title,
    unit_label: a.unit_label,
    unit_index: a.unit_index,
    unit_title: a.unit_title,
  }));

  return (
    <div className="quiz-editor-page">
      <nav className="quiz-editor-backlink">
        <Link href="/tutor/quizzes">← Back to quizzes</Link>
      </nav>

      <QuizEditor
        quiz={detail.quiz}
        items={detail.items}
        pickerQuestions={pickerQuestions}
        pickerFilters={filters}
        pickerTagOptions={tagOptions}
        programmes={programmes}
        activities={activities}
      />
    </div>
  );
}
