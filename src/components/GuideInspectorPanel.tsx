import React from 'react';
import { GuideGesture, GuideInspectTarget } from '../types/floorplan';
import { Footprints, Hand, Smile, Sparkles, User, X } from 'lucide-react';

interface GuideInspectorPanelProps {
  inspectTarget: GuideInspectTarget;
  onSelectTarget: (target: GuideInspectTarget) => void;
  gesture: GuideGesture;
  onSelectGesture: (gesture: GuideGesture) => void;
}

const TARGET_DETAILS: Record<
  Exclude<GuideInspectTarget, 'none'>,
  { title: string; detail: string }
> = {
  full: {
    title: 'Complete 3D Human Guide (1.71 m)',
    detail:
      'Proportioned articulated skeleton featuring sculpted head, cervical neck, torso, two arms with 5-finger hands, and two legs with bare 5-toe feet.',
  },
  head: {
    title: 'Head, Face & Articulated Neck',
    detail:
      'Sculpted cranium & jawline, blinking eyelids, hazel irises, eyebrows, nose bridge & nostrils, speaking lips, ears with lobes, and neck with clavicles.',
  },
  hands: {
    title: 'Arms, Palms & 5 Fingers Each (10 Total)',
    detail:
      'Upper arms, elbows, forearms, wrists, curved palms with thenar pads, and opposable Thumb, Index, Middle, Ring & Pinky fingers with knuckles and nails.',
  },
  feet: {
    title: 'Legs, Ankles & 5 Toes Each (10 Total)',
    detail:
      'Ankle malleoli, heels, arches, insteps, metatarsal balls, and 5 separated articulated toes per foot (Hallux big toe, 2nd, 3rd, 4th & 5th little toe) with toenails.',
  },
};

export const GuideInspectorPanel: React.FC<GuideInspectorPanelProps> = ({
  inspectTarget,
  onSelectTarget,
  gesture,
  onSelectGesture,
}) => {
  if (inspectTarget === 'none') return null;

  const info = TARGET_DETAILS[inspectTarget];

  const tabs: { id: Exclude<GuideInspectTarget, 'none'>; label: string; icon: React.ReactNode }[] = [
    { id: 'full', label: 'Full Body', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'head', label: 'Head & Neck', icon: <Smile className="w-3.5 h-3.5" /> },
    { id: 'hands', label: 'Hands (5×2)', icon: <Hand className="w-3.5 h-3.5" /> },
    { id: 'feet', label: 'Feet (5×2)', icon: <Footprints className="w-3.5 h-3.5" /> },
  ];

  const gestures: { id: GuideGesture; label: string }[] = [
    { id: 'auto', label: 'Natural' },
    { id: 'wave', label: 'Wave' },
    { id: 'present', label: 'Guide Pose' },
    { id: 'show_hands', label: 'Spread 10 Fingers' },
    { id: 'show_feet', label: 'Flex 10 Toes' },
  ];

  return (
    <div className="pointer-events-auto studio-glass rounded-2xl p-3.5 w-[min(430px,92vw)] shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#C85A32]" />
          <span className="text-xs font-bold text-[#1C1B19]">{info.title}</span>
        </div>
        <button
          onClick={() => {
            onSelectGesture('auto');
            onSelectTarget('none');
          }}
          className="p-1 rounded-lg text-[#6B6860] hover:bg-black/6 hover:text-[#1C1B19] transition cursor-pointer"
          title="Exit guide close-up inspector"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Close-up Camera Region Switcher */}
      <div className="grid grid-cols-4 gap-1 bg-black/[0.045] p-1 rounded-xl mb-2">
        {tabs.map((tab) => {
          const active = inspectTarget === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                onSelectGesture('auto');
                onSelectTarget(tab.id);
              }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                active
                  ? 'bg-white text-[#1C1B19] shadow-sm font-semibold'
                  : 'text-[#57534E] hover:text-[#1C1B19]'
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-[#57534E] mb-2.5">{info.detail}</p>

      {/* Gesture Test Pills */}
      <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-black/8">
        <span className="text-[10px] font-mono-tech uppercase text-[#6B6860] mr-1">Pose:</span>
        {gestures.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelectGesture(g.id)}
            className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium transition cursor-pointer ${
              gesture === g.id
                ? 'bg-[#C85A32] text-white'
                : 'bg-black/[0.05] text-[#4A4742] hover:bg-black/10'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
};
