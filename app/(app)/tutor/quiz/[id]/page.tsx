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
} from '@/lib/tutor-quiz/queries';
import { QuizEditor } from '@/lib/tutor-quiz/quiz-editor';
import type { QuizPickerFilters } from '@/lib/tutor-quiz/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    type?: string;
    category?: string;
    difficulty?: string;
    q?: string;
  }>;
}

export default async function TutorQuizEditorPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const filters: QuizPickerFilters = {
    type: sp.type ?? '',
    category: sp.category ?? '',
    difficulty: sp.difficulty ?? '',
    q: sp.q ?? '',
  };

  const detail = await getQuizDetail(id);
  if (!detail) notFound();

  const pickerQuestions = await getPickerQuestions(filters);

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
      />
    </div>
  );
}
