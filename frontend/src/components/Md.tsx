import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Texte Markdown venant de GitLab. Le HTML brut n'est jamais interprété. */
export default function Md({ children }: { children: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {children}
      </Markdown>
    </div>
  );
}
