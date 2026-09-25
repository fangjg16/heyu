import { formatCollabLineBreaks } from "@/lib/collab-question-text";
import { previewCollabQuestion } from "@/lib/kn-citations";
import type { CollabItem } from "@/lib/project-api";

/** 展开补充问询时，把此前每一轮提问和答复按时间排开。 */
export function CollabQuestionChain({ turns }: { turns: CollabItem[] }) {
  if (turns.length === 0) return null;
  return (
    <div className="space-y-3">
      {turns.map((turn, index) => {
        const preview = previewCollabQuestion(turn);
        const title = formatCollabLineBreaks(preview.title);
        const detail =
          preview.detail && preview.detail.trim() !== preview.title.trim()
            ? formatCollabLineBreaks(preview.detail)
            : "";
        const reply = (turn.replyText ?? "").trim();
        return (
          <div
            key={turn.id}
            className="border-l-2 border-[rgba(160,99,88,0.35)] pl-3"
          >
            <p className="text-[11.5px] text-[#969E9A]">
              {index === 0 ? "原问题" : "此前补充"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#1F2423]">
              {title}
            </p>
            {detail ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-[#59625F]">
                {detail}
              </p>
            ) : null}
            {reply ? (
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#1F2423]">
                <span className="text-[#59625F]">项目协作方答复：</span>
                {formatCollabLineBreaks(reply)}
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="text-[11.5px] text-[#A06358]">本次补充</p>
    </div>
  );
}
