import FileUpload from "../../ui/file-upload";

export default function DocumentPage() {
  return (
    <section className="domain-list">
      <h2>문서 보관함</h2>
      <p>영수증, 증빙 파일을 업로드하고 링크로 관리합니다.</p>
      <FileUpload />
    </section>
  );
}
