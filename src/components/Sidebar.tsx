
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Home, 
  Upload, 
  FileText, 
  Search, 
  BarChart3, 
  User, 
  Settings, 
  Brain,
  LogOut
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar = ({ activeTab, setActiveTab }: SidebarProps) => {
  const { signOut } = useAuth();
  const { toast } = useToast();

  const menuItems = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "upload", label: "Upload Resumes", icon: Upload },
    { id: "resumes", label: "All Resumes", icon: FileText },
    { id: "search", label: "Search Candidates", icon: Search },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-64 bg-white/80 backdrop-blur-sm border-r border-gray-200 min-h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            TalentCopilot
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant={activeTab === item.id ? "default" : "ghost"}
            className={cn(
              "w-full justify-start",
              activeTab === item.id 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white" 
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            )}
            onClick={() => setActiveTab(item.id)}
          >
            <item.icon className="h-4 w-4 mr-3" />
            {item.label}
          </Button>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="absolute bottom-4 left-4 right-4 space-y-2">
        <Button 
          variant={activeTab === "profile" ? "default" : "ghost"}
          className={cn(
            "w-full justify-start",
            activeTab === "profile"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          )}
          onClick={() => setActiveTab("profile")}
        >
          <User className="h-4 w-4 mr-3" />
          Profile
        </Button>
        <Button 
          variant={activeTab === "settings" ? "default" : "ghost"}
          className={cn(
            "w-full justify-start",
            activeTab === "settings"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          )}
          onClick={() => setActiveTab("settings")}
        >
          <Settings className="h-4 w-4 mr-3" />
          Settings
        </Button>
        <Button 
          variant="ghost" 
          className="w-full justify-start text-gray-600 hover:text-gray-900"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
