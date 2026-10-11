import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Graqivo - Your work, connected.', icons:{icon:'/icon.svg'}, description:'Connect projects, resources, people, and decisions in one organized workspace.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
