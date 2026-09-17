'use client';

import { motion } from 'framer-motion';
import { DASHBOARD_SECTIONS, type DashboardSectionId } from '@/lib/sections';

type SectionNavProps = {
  active: DashboardSectionId;
  onChange: (id: DashboardSectionId) => void;
};

export default function SectionNav({ active, onChange }: SectionNavProps) {
  return (
    <nav
      className="section-nav"
      aria-label="Dashboard sections"
    >
      <div className="section-nav__list" role="tablist" aria-orientation="vertical">
        {DASHBOARD_SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              id={`section-tab-${section.id}`}
              aria-selected={isActive}
              aria-controls={`section-panel-${section.id}`}
              className={`section-nav__item${isActive ? ' section-nav__item--active' : ''}`}
              data-cursor="interactive"
              onClick={() => onChange(section.id)}
            >
              {isActive && (
                <motion.span
                  layoutId="section-nav-indicator"
                  className="section-nav__indicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  aria-hidden
                />
              )}
              <span className="section-nav__num">{section.num}</span>
              <span className="section-nav__label">{section.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
