import { MediaHeader } from '@/components/tracker/media-header';
import '@/x-master/app/tools-scoped.css';
export default function ToolsLayout({children}:{children:React.ReactNode}) {
  return <><MediaHeader source="master"/><div className="x-master-tools">{children}</div></>;
}
