import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, query, writeBatch, getDocs } from 'firebase/firestore';

// --- Helper Functions & Initial Data ---
const PACKAGE_OPTIONS = ['None', 'Food', 'Food & Drink'];
const ALL_ACTIVITIES = ['Ping Pong', 'Darts', 'Shuffleboard', 'Cornhole', 'Escape Rooms'];
const DIETARY_OPTIONS = { gf: 'GF', df: 'DF', ve: 'VE', vg: 'VG', nt: 'NT' };

const formatTime = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m < 10 ? '0' : ''}${m} ${ampm}`;
};

const formatCurrentTime = (date) => {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0'+minutes : minutes;
    return { time: `${hours}:${minutes}`, ampm: ampm };
};

const calculateEndTime = (startTime, activityBlocks) => {
    if (!startTime || !activityBlocks) return '';
    const totalDuration = activityBlocks.reduce((sum, block) => sum + (block.duration || 0), 0);
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    const endDate = new Date(startDate.getTime() + totalDuration * 60000);
    const endHours = endDate.getHours();
    const endMinutes = endDate.getMinutes();
    return `${endHours < 10 ? '0' : ''}${endHours}:${endMinutes < 10 ? '0' : ''}${endMinutes}`;
};

const formatDuration = (minutes) => {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    let result = '';
    if (h > 0) result += `${h}h`;
    if (m > 0) result += ` ${m}m`;
    return result.trim();
};

const generateTimeOptions = () => {
    const options = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            const hour = h < 10 ? `0${h}` : h;
            const minute = m < 10 ? `0${m}` : m;
            options.push(`${hour}:${minute}`);
        }
    }
    return options;
};
const TIME_OPTIONS = generateTimeOptions();

const SESSION_LENGTH_OPTIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15); // 15 mins to 4 hours

// --- Icon Components ---
const PlusCircleIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>);
const Trash2Icon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>);
const ClockIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>);
const UsersIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>);
const UtensilsIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z"></path></svg>);
const ChevronUpIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>);
const SettingsIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
const MapPinIcon = (props) => (<svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>);

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCdv7G2uxG-TqHmrAkim8NeLsJApt3tFlM",
  authDomain: "checkin-kitchen-app.firebaseapp.com",
  projectId: "checkin-kitchen-app",
  storageBucket: "checkin-kitchen-app.appspot.com",
  messagingSenderId: "496734911234",
  appId: "1:496734911234:web:db8be764640f9a2476e01b"
};

// --- Main App Component ---
export default function App() {
    const [groups, setGroups] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [areas, setAreas] = useState([]);
    const [foodItems, setFoodItems] = useState({ pizzas: {}, snacks: {} });
    const [dailyStats, setDailyStats] = useState({ people: 0, pizzaActual: 0, pizzaEstimate: 0, snackActual: 0, snackEstimate: 0, drinks: 0 });
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
    const [isConfirmingClear, setIsConfirmingClear] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                const app = initializeApp(firebaseConfig);
                const authInstance = getAuth(app);
                const firestore = getFirestore(app);
                setDb(firestore);
                setAuth(authInstance);
                onAuthStateChanged(authInstance, (user) => {
                    if (user) {
                        if(isLoading) setIsLoading(false);
                    } else {
                        signInAnonymously(authInstance).catch(authError => {
                            console.error("Anonymous sign-in failed:", authError);
                            setError("Could not authenticate.");
                            setIsLoading(false);
                        });
                    }
                });
            } catch (e) {
                console.error("Firebase initialization error:", e);
                setError("Could not connect to the service.");
                setIsLoading(false);
            }
        };
        initializeFirebase();
    }, [isLoading]);

    // --- Data Fetching & Stat Calculation ---
    useEffect(() => {
        if (!db || !auth?.currentUser) return;
        
        const unsubFoodItems = onSnapshot(collection(db, "foodItems"), (snapshot) => {
            const items = { pizzas: {}, snacks: {} };
            snapshot.forEach(doc => { if (doc.id === 'pizzas' || doc.id === 'snacks') items[doc.id] = doc.data(); });
            setFoodItems(items);
        });

        const unsubAreas = onSnapshot(collection(db, "areas"), (snapshot) => {
            setAreas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubGroups = onSnapshot(query(collection(db, "groups")), (snapshot) => {
            const groupsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            groupsData.sort((a, b) => a.time.localeCompare(b.time)); 
            setGroups(groupsData);
        });

        const qTeamMembers = query(collection(db, "teamMembers"));
        const unsubTeamMembers = onSnapshot(qTeamMembers, (snapshot) => {
            setTeamMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { unsubGroups(); unsubTeamMembers(); unsubFoodItems(); unsubAreas(); };
    }, [db, auth?.currentUser]);

    useEffect(() => {
        let people = 0, pizzaActual = 0, pizzaEstimate = 0, snackActual = 0, snackEstimate = 0, drinks = 0;
        groups.forEach(g => {
            people += Number(g.teamSize) || 0;
            if (g.package === 'Food & Drink') drinks += (Number(g.teamSize) || 0) * 2;
            if (g.package === 'Food' || g.package === 'Food & Drink') {
                pizzaEstimate += Math.ceil((Number(g.teamSize) || 0) / 2);
                snackEstimate += Math.ceil((Number(g.teamSize) || 0) / 2);
            }
            pizzaActual += Object.keys(foodItems.pizzas || {}).reduce((sum, key) => sum + (g.foodOrder?.[key] || 0), 0);
            snackActual += Object.keys(foodItems.snacks || {}).reduce((sum, key) => sum + (g.foodOrder?.[key] || 0), 0);
        });
        setDailyStats({ people, pizzaActual, pizzaEstimate, snackActual, snackEstimate, drinks });
    }, [groups, foodItems]);

    // --- Data Manipulation ---
    const addGroup = async () => {
        if (!db) return;
        const lastGroupTime = groups.length > 0 ? groups[groups.length - 1].time : "19:00";
        await addDoc(collection(db, "groups"), {
            teamName: "New Team", time: lastGroupTime, teamSize: 2, package: 'None',
            status: { brief: false, chkd: false, food: false, paid: false, done: false },
            notes: "", foodOrder: {}, dietary: { gf: 0, df: 0, ve: 0, vg: 0, nt: 0 },
            createdAt: new Date(), assignedTeamMember: "", assignedAreas: [],
            activityBlocks: []
        });
    };
    
    const addTeamMember = async (name) => { if (!db || !name.trim()) return; await addDoc(collection(db, "teamMembers"), { name: name.trim() }); };
    const deleteTeamMember = async (id) => { if (!db) return; await deleteDoc(doc(db, "teamMembers", id)); };
    const addArea = async (name) => { if (!db || !name.trim()) return; await addDoc(collection(db, "areas"), { name: name.trim() }); };
    const deleteArea = async (id) => { if (!db) return; await deleteDoc(doc(db, "areas", id)); };
    const updateGroup = async (groupId, updatedData) => { if (!db) return; await updateDoc(doc(db, "groups", groupId), updatedData); };
    const deleteGroup = async (groupId) => { if (!db) return; try { await deleteDoc(doc(db, "groups", groupId)); } catch (err) { console.error("Error deleting group:", err); } };
    
    const clearAllGroups = async () => {
        if (!db) return;
        const batch = writeBatch(db);
        const snapshot = await getDocs(query(collection(db, "groups")));
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        setIsConfirmingClear(false);
    };
    
    const { time, ampm } = formatCurrentTime(currentTime);

    if (error) return (<div className="bg-black text-white min-h-screen flex items-center justify-center font-inter"><div className="bg-red-500 p-8 rounded-lg shadow-2xl text-center"><h2 className="text-2xl font-bold mb-2">Error</h2><p>{error}</p></div></div>);
    if (isLoading) return (<div className="bg-black text-white min-h-screen flex items-center justify-center font-inter"><p>Connecting to Service...</p></div>);

    return (
        <>
            <script src="https://cdn.tailwindcss.com"></script>
            <style type="text/tailwindcss">{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
                body, input, select, textarea, button, span { font-family: 'Inter', sans-serif !important; }
            `}</style>
            <div className="bg-black min-h-screen font-inter text-white p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    <header className="flex flex-wrap justify-between items-center gap-4 mb-6">
                        <img src="https://images.squarespace-cdn.com/content/v1/6280b73cb41908114afef4a1/5bb4bba5-e8c3-4c38-b672-08c0b4ee1f4c/serve-social.png" alt="Serve Social Logo" className="h-10" />
                        <div className="bg-transparent border border-white px-4 py-2 rounded-lg text-center">
                            <p className="text-2xl font-bold">{time}<span className="text-base ml-1">{ampm}</span></p>
                        </div>
                        <div className="flex items-center gap-6 text-center">
                            <div className="bg-gray-800 px-4 py-2 rounded-lg"><p className="text-2xl font-bold">{dailyStats.people}</p><p className="text-xs text-gray-400">People</p></div>
                            <div className="bg-gray-800 px-4 py-2 rounded-lg"><p className="text-2xl font-bold">{dailyStats.pizzaActual} / {dailyStats.pizzaEstimate}</p><p className="text-xs text-gray-400">Pizzas</p></div>
                            <div className="bg-gray-800 px-4 py-2 rounded-lg"><p className="text-2xl font-bold">{dailyStats.snackActual} / {dailyStats.snackEstimate}</p><p className="text-xs text-gray-400">Snacks</p></div>
                             <div className="bg-gray-800 px-4 py-2 rounded-lg"><p className="text-2xl font-bold">{dailyStats.drinks}</p><p className="text-xs text-gray-400">Drinks</p></div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isConfirmingClear ? (<button onClick={() => setIsConfirmingClear(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">CLEAR</button>) : (<div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg"><span className="text-gray-300 text-sm">Are you sure?</span><button onClick={clearAllGroups} className="bg-red-700 hover:bg-red-800 text-white font-bold py-1 px-3 rounded-lg text-sm">YES</button><button onClick={() => setIsConfirmingClear(false)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded-lg text-sm">NO</button></div>)}
                            <button onClick={addGroup} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-lg">ADD</button>
                        </div>
                    </header>
                    <div className="space-y-4">
                        {groups.map((group) => (
                            <GroupCardWrapper key={group.id} group={group} teamMembers={teamMembers} foodItems={foodItems} areas={areas} onUpdate={updateGroup} onDeleteGroup={deleteGroup} onManageTeam={() => setIsTeamModalOpen(true)} onManageAreas={() => setIsAreaModalOpen(true)}/>
                        ))}
                        {groups.length === 0 && !isLoading && (<div className="text-center py-16 px-4 bg-gray-900 rounded-lg"><h3 className="text-xl font-semibold text-gray-300">No groups found.</h3><p className="text-gray-500 mt-2">Click "Add Group" to get started.</p></div>)}
                    </div>
                </div>
                <TeamManagementModal isOpen={isTeamModalOpen} onClose={() => setIsTeamModalOpen(false)} teamMembers={teamMembers} onAdd={addTeamMember} onDelete={deleteTeamMember} />
                <AreaManagementModal isOpen={isAreaModalOpen} onClose={() => setIsAreaModalOpen(false)} areas={areas} onAdd={addArea} onDelete={deleteArea} />
            </div>
        </>
    );
}

// --- Components ---
const GroupCardWrapper = ({ group, teamMembers, foodItems, areas, onUpdate, onDeleteGroup, onManageTeam, onManageAreas }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    return isExpanded 
        ? <GroupDetails group={group} teamMembers={teamMembers} areas={areas} onUpdate={onUpdate} onDeleteGroup={onDeleteGroup} onCollapse={() => setIsExpanded(false)} onManageTeam={onManageTeam} onManageAreas={onManageAreas} />
        : <GroupSummary group={group} foodItems={foodItems} onUpdate={onUpdate} onExpand={() => setIsExpanded(true)} />;
};

const GroupSummary = ({ group, foodItems, onUpdate, onExpand }) => {
    const { brief, chkd, food, paid, done } = group.status || {};
    const isFullyComplete = brief && chkd && food && paid && done;
    const hasFoodPackage = group.package === 'Food' || group.package === 'Food & Drink';
    const dietarySummary = Object.entries(group.dietary || {}).filter(([, count]) => count > 0);
    const handleStatusChange = (e, statusField) => { e.stopPropagation(); onUpdate(group.id, { [`status.${statusField}`]: !group.status[statusField] }); };
    const cardClasses = `rounded-2xl shadow-md border p-4 cursor-pointer transition-all duration-300 ${isFullyComplete ? 'bg-green-900/40 border-green-700/50' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`;
    
    const totalPizzas = Object.keys(foodItems.pizzas || {}).reduce((sum, key) => sum + (group.foodOrder?.[key] || 0), 0);
    const totalSnacks = Object.keys(foodItems.snacks || {}).reduce((sum, key) => sum + (group.foodOrder?.[key] || 0), 0);
    const pizzaEstimate = Math.ceil((Number(group.teamSize) || 0) / 2);
    const snackEstimate = Math.ceil((Number(group.teamSize) || 0) / 2);
    const endTime = calculateEndTime(group.time, group.activityBlocks);
    const activitySummary = (group.activityBlocks || []).map(block => `${formatDuration(block.duration)} ${block.activities.join(' + ')}`).join(' → ');

    const PackageBadge = ({ pkg }) => {
        if (pkg === 'Food') return <span className="text-xs font-bold bg-yellow-500 text-yellow-900 px-2 py-1 rounded-md">{pkg}</span>;
        if (pkg === 'Food & Drink') return <span className="text-xs font-bold bg-purple-500 text-white px-2 py-1 rounded-md">{pkg}</span>;
        return <span className="text-xs text-gray-400">{pkg}</span>
    };

    return (
        <div onClick={onExpand} className={cardClasses}>
            <div className="flex items-start justify-between gap-x-6">
                <div className="flex items-start gap-4 flex-grow min-w-0">
                    <div className="text-center w-24 flex-shrink-0">
                        <div className="text-lg">{formatTime(group.time)}</div>
                        <div className="text-sm text-gray-400">to {formatTime(endTime)}</div>
                        <div className="text-4xl font-bold text-white mt-1">{group.teamSize}</div>
                    </div>
                    <div className="min-w-0 flex-grow">
                        <span className="font-bold text-xl text-white truncate">{group.teamName}</span>
                        <div className="text-xs text-gray-400 flex flex-wrap items-center gap-x-2">
                            <PackageBadge pkg={group.package} />
                            {group.assignedTeamMember && <><span className="text-gray-600">|</span><span className="font-semibold text-gray-300">{group.assignedTeamMember}</span></>}
                        </div>
                         <p className="text-xs text-gray-400 mt-2">{activitySummary}</p>
                         <div className="mt-2 text-left">
                            <div className="grid grid-cols-[auto,1fr] gap-x-2">
                                <h4 className="text-xs text-gray-500 flex-shrink-0 self-start pt-1">Area</h4>
                                <div className="flex flex-wrap gap-1">{(group.assignedAreas || []).map(area => <span key={area} className="text-sm font-semibold bg-blue-900/50 text-blue-300 px-2 py-1 rounded">{area}</span>)}</div>
                            </div>
                        </div>
                         {dietarySummary.length > 0 && 
                            <div className="mt-2 text-left">
                                <div className="flex items-start gap-2">
                                    <h4 className="text-xs text-gray-500 flex-shrink-0 pt-1">Dietary</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {dietarySummary.map(([key, count]) => <span key={key} className="text-sm font-semibold bg-amber-900/50 text-amber-300 px-2 py-1 rounded">{DIETARY_OPTIONS[key]} {count}</span>)}
                                    </div>
                                </div>
                            </div>
                        }
                         {group.notes && <p className="text-xs text-gray-300 mt-2 pt-2 border-t border-gray-700/50 italic">{group.notes}</p>}
                    </div>
                </div>
                <div className="flex items-start gap-4 flex-shrink-0">
                    {hasFoodPackage && (<div className="flex flex-col gap-2"><div className="bg-gray-700/50 px-3 py-1 rounded-md text-center"><p className="font-bold text-lg">{totalPizzas} / {pizzaEstimate}</p><p className="text-xs text-gray-400">Pizzas</p></div><div className="bg-gray-700/50 px-3 py-1 rounded-md text-center"><p className="font-bold text-lg">{totalSnacks} / {snackEstimate}</p><p className="text-xs text-gray-400">Snacks</p></div></div>)}
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2"><StatusButton label="BRIEF" active={brief} onClick={(e) => handleStatusChange(e, 'brief')} /><StatusButton label="CHECK" active={chkd} onClick={(e) => handleStatusChange(e, 'chkd')} /><StatusButton label="FOOD" active={food} onClick={(e) => handleStatusChange(e, 'food')} /></div>
                        <div className="flex gap-2"><StatusButton label="PAID" active={paid} onClick={(e) => handleStatusChange(e, 'paid')} /><StatusButton label="DONE" active={done} onClick={(e) => handleStatusChange(e, 'done')} /></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const GroupDetails = ({ group, teamMembers, areas, onUpdate, onDeleteGroup, onCollapse, onManageTeam, onManageAreas }) => {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const handleInputChange = (field, value) => onUpdate(group.id, { [field]: value });
    const handleTeamSizeChange = (e) => { const size = parseInt(e.target.value, 10); if (!isNaN(size) && size >= 0) onUpdate(group.id, { teamSize: size }); };
    const handleDietaryChange = (key, value) => { const numValue = parseInt(value, 10); if(!isNaN(numValue) && numValue >= 0) onUpdate(group.id, { [`dietary.${key}`]: numValue }); };
    const hasFoodPackage = group.package === 'Food' || group.package === 'Food & Drink';

    const handleAreaToggle = (areaName) => {
        const currentAreas = group.assignedAreas || [];
        const newAreas = currentAreas.includes(areaName) ? currentAreas.filter(a => a !== areaName) : [...currentAreas, areaName];
        onUpdate(group.id, { assignedAreas: newAreas });
    };

    const handleActivityBlockChange = (blockIndex, field, value) => {
        const newBlocks = [...(group.activityBlocks || [])];
        newBlocks[blockIndex][field] = value;
        onUpdate(group.id, { activityBlocks: newBlocks });
    };

    const addActivityToBlock = (blockIndex, activityName) => {
        const newBlocks = [...(group.activityBlocks || [])];
        if (!newBlocks[blockIndex].activities.includes(activityName)) {
            newBlocks[blockIndex].activities.push(activityName);
            onUpdate(group.id, { activityBlocks: newBlocks });
        }
    };

    const removeActivityFromBlock = (blockIndex, activityName) => {
        const newBlocks = [...(group.activityBlocks || [])];
        newBlocks[blockIndex].activities = newBlocks[blockIndex].activities.filter(a => a !== activityName);
        onUpdate(group.id, { activityBlocks: newBlocks });
    };

    const addActivityBlock = () => {
        const newBlocks = [...(group.activityBlocks || []), { duration: 60, activities: [] }];
        onUpdate(group.id, { activityBlocks: newBlocks });
    };

    const removeActivityBlock = (blockIndex) => {
        const newBlocks = (group.activityBlocks || []).filter((_, i) => i !== blockIndex);
        onUpdate(group.id, { activityBlocks: newBlocks });
    };
    
    const usedActivities = (group.activityBlocks || []).flatMap(b => b.activities);
    const availableActivities = ALL_ACTIVITIES.filter(a => !usedActivities.includes(a));

    return (
        <div className="bg-gray-900 rounded-2xl shadow-md overflow-hidden border border-blue-700/60 ring-2 ring-blue-600/30">
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <input type="text" value={group.teamName} onChange={(e) => handleInputChange('teamName', e.target.value)} className="bg-transparent text-2xl font-bold w-full focus:outline-none focus:bg-gray-800 rounded-md p-1 -m-1"/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-5 items-end">
                    <div><label className="text-xs text-gray-500 flex items-center gap-2"><ClockIcon className="w-4 h-4"/>Time</label><select value={group.time} onChange={(e) => handleInputChange('time', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-md p-1.5 w-full text-white mt-1">{TIME_OPTIONS.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}</select></div>
                    <div><label className="text-xs text-gray-500 flex items-center gap-2"><UsersIcon className="w-4 h-4"/>Team Size</label><input type="number" value={group.teamSize} onChange={handleTeamSizeChange} className="bg-gray-800 border border-gray-700 rounded-md p-1.5 w-full text-white mt-1"/></div>
                    <div><label className="text-xs text-gray-500 flex items-center gap-2"><UtensilsIcon className="w-4 h-4"/>Package</label><select value={group.package} onChange={(e) => handleInputChange('package', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-md p-1.5 w-full text-white mt-1">{PACKAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                    <div>
                        <label className="text-xs text-gray-500 flex items-center justify-between"><span className="flex items-center gap-2">Assign Staff</span><button onClick={onManageTeam} className="text-gray-400 hover:text-white"><SettingsIcon className="w-4 h-4"/></button></label>
                        <select value={group.assignedTeamMember || ""} onChange={(e) => handleInputChange('assignedTeamMember', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-md p-1.5 w-full text-white mt-1"><option value="">Unassigned</option>{teamMembers.map(tm => <option key={tm.id} value={tm.name}>{tm.name}</option>)}</select>
                    </div>
                </div>
                <div>
                    <label className="text-xs text-gray-500 flex items-center justify-between mb-2"><span className="flex items-center gap-2"><MapPinIcon className="w-4 h-4"/>Areas</span><button onClick={onManageAreas} className="text-gray-400 hover:text-white"><SettingsIcon className="w-4 h-4"/></button></label>
                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3 w-full text-white flex flex-wrap gap-2">
                        {[...areas].sort((a,b) => a.name.localeCompare(b.name)).map(area => {
                            const isSelected = (group.assignedAreas || []).includes(area.name);
                            return <button key={area.id} onClick={() => handleAreaToggle(area.name)} className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{area.name}</button>
                        })}
                    </div>
                </div>
                <div className="my-5">
                    <h4 className="font-semibold mb-2 text-gray-300">Activity Blocks</h4>
                    <div className="space-y-4">
                        {(group.activityBlocks || []).map((block, index) => (
                            <div key={index} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                                <div className="flex justify-between items-center mb-2">
                                    <select value={block.duration} onChange={(e) => handleActivityBlockChange(index, 'duration', Number(e.target.value))} className="bg-gray-700 border border-gray-600 rounded-md p-1.5 text-white">
                                        {SESSION_LENGTH_OPTIONS.map(l => <option key={l} value={l}>{formatDuration(l)}</option>)}
                                    </select>
                                    <button onClick={() => removeActivityBlock(index)} className="text-gray-500 hover:text-red-500"><Trash2Icon className="w-5 h-5"/></button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {block.activities.map(act => <span key={act} className="flex items-center gap-1 bg-gray-700 px-2 py-1 rounded text-sm">{act} <button onClick={() => removeActivityFromBlock(index, act)} className="text-red-400">x</button></span>)}
                                </div>
                                <select onChange={(e) => addActivityToBlock(index, e.target.value)} value="" className="mt-2 w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white">
                                    <option value="" disabled>+ Add activity to block...</option>
                                    {availableActivities.map(act => <option key={act} value={act}>{act}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                    <button onClick={addActivityBlock} className="mt-3 w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 font-bold py-2 px-4 rounded-lg">Add Activity Block</button>
                </div>
                <div>
                    <h4 className="font-semibold mb-2 text-gray-300">Notes</h4>
                    <textarea value={group.notes} onChange={(e) => handleInputChange('notes', e.target.value)} rows="3" className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Add any notes here..."/>
                </div>
                {hasFoodPackage && (
                    <div className="mt-5">
                        <h4 className="font-semibold mb-2 text-gray-300">Dietary Requirements</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 bg-gray-800 p-3 rounded-lg">
                            {Object.entries(DIETARY_OPTIONS).map(([key, label]) => (<div key={key}><label className="text-sm text-gray-400">{label}</label><input type="number" value={group.dietary?.[key] || 0} onChange={(e) => handleDietaryChange(key, e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md p-1.5 w-full text-white mt-1"/></div>))}
                        </div>
                    </div>
                )}
                 <div className="mt-6 flex justify-between items-center">
                    <div>
                        {!isConfirmingDelete ? (
                            <button onClick={() => setIsConfirmingDelete(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">DELETE</button>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-gray-300">Are you sure?</span>
                                <button onClick={() => onDeleteGroup(group.id)} className="bg-red-700 hover:bg-red-800 text-white font-bold py-2 px-4 rounded-lg">YES</button>
                                <button onClick={() => setIsConfirmingDelete(false)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">NO</button>
                            </div>
                        )}
                    </div>
                    <button onClick={onCollapse} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"><ChevronUpIcon className="w-5 h-5"/>Collapse</button>
                </div>
            </div>
        </div>
    );
};

const StatusButton = ({ label, active, onClick }) => {
    const baseClasses = "w-16 h-10 flex items-center justify-center rounded-md text-xs font-bold transition-all duration-200 leading-tight text-center";
    const activeClasses = "bg-green-500 text-white shadow-lg";
    const inactiveClasses = "bg-gray-600 text-gray-300 hover:bg-gray-500";
    return <button onClick={onClick} className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}>{label}</button>;
};

const ManagementModal = ({ isOpen, onClose, title, items, onAdd, onDelete }) => {
    const [name, setName] = useState("");
    if (!isOpen) return null;

    const handleAdd = () => {
        onAdd(name);
        setName("");
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"><div className="bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-700"><h2 className="text-2xl font-bold mb-4">{title}</h2><div className="flex gap-2 mb-4"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${title.slice(7).toLowerCase()} name`} className="flex-grow bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"/><button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg"><PlusCircleIcon className="w-6 h-6"/></button></div><div className="space-y-2 max-h-60 overflow-y-auto">{(items || []).map(item => (<div key={item.id} className="flex justify-between items-center bg-gray-800 p-2 rounded-lg"><span>{item.name}</span><button onClick={() => onDelete(item.id)} className="text-gray-500 hover:text-red-500"><Trash2Icon className="w-5 h-5"/></button></div>))}</div><button onClick={onClose} className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">Done</button></div></div>
    );
};

const TeamManagementModal = ({ teamMembers, ...props }) => <ManagementModal {...props} title="Manage Team" items={teamMembers} />;
const AreaManagementModal = ({ areas, ...props }) => <ManagementModal {...props} title="Manage Areas" items={areas} />;
