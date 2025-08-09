import 'server-only';
import ChatComponent from './components/Chat';
import { cookies } from 'next/headers';
import DocumentViewer from './components/PDFViewer';
import WebsiteWiever from './components/WebsiteWiever';
import { v4 as uuidv4 } from 'uuid';
import { getUserInfo } from '@/lib/server/supabase';
import { unstable_noStore as noStore } from 'next/cache';

interface PageProps {
  searchParams: Promise<Record<string, string>>;
  sidebarData?: any;
}

export default async function ChatPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const cookieStore = await cookies();
  const modelType = cookieStore.get('modelType')?.value ?? 'standart';
  const selectedOption =
    cookieStore.get('selectedOption')?.value ?? 'gpt-3.5-turbo-1106';
  
  // Generate a unique chat ID for each new chat session
  // Use a timestamp-based approach to ensure stability during the same session
  const createChatId = uuidv4();

  // Get user data for mobile sidebar
  const userData = await getUserInfo();

  return (
    <div className="flex w-full h-full overflow-hidden">
      <div className="flex-1">
        <ChatComponent
          key={`new-chat-${createChatId}`}
          chatId={createChatId}
          initialModelType={modelType}
          initialSelectedOption={selectedOption}
          userData={userData}
          sidebarData={props.sidebarData}
        />
      </div>
      {searchParams.url ? (
        <WebsiteWiever url={decodeURIComponent(searchParams.url)} />
      ) : searchParams.pdf ? (
        <DocumentComponent fileName={decodeURIComponent(searchParams.pdf)} />
      ) : null}
    </div>
  );
}

async function DocumentComponent({ fileName }: { fileName: string }) {
  const session = await getUserInfo();
  const userId = session?.id;

  return <DocumentViewer fileName={fileName} userId={userId} />;
}
