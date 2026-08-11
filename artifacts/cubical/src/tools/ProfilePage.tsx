import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Sparkles, X } from 'lucide-react';
import { BackButton } from '../shared/contexts';

// ── Local types (mirror App.tsx — localStorage keys must match) ───────────────
interface ProfileData { name: string; avatar: string | null; bannerColor: string; }
const DEFAULT_PROFILE: ProfileData = { name: '', avatar: null, bannerColor: '#7c9e8f' };

const PROFILE_KEY      = 'cubical-profile';
const PROFILE_SKIN_KEY = 'cubical-profile-skin';

function isProfileData(v: unknown): v is ProfileData {
  return !!v && typeof v === 'object' && typeof (v as Record<string,unknown>).name === 'string';
}

function readLocal<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

function readProfile(): ProfileData {
  return { ...DEFAULT_PROFILE, ...readLocal<ProfileData>(PROFILE_KEY, DEFAULT_PROFILE, isProfileData) };
}

function writeProfile(p: ProfileData) {
  try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

function applySkin(skinId: string) {
  if (skinId === 'default' || !skinId) {
    document.documentElement.removeAttribute('data-skin');
  } else {
    document.documentElement.dataset.skin = skinId;
  }
}

interface CubicalSkin { id: string; name: string; description: string; owned: boolean; comingSoon?: boolean; }

const CUBICAL_SKINS: CubicalSkin[] = [
  { id: 'default', name: 'Default', description: 'Clean and calm. The original Cubical look.',                owned: true },
  { id: 'sakura',  name: 'Sakura',  description: 'Cherry blossoms and soft pinks. A peaceful seasonal look.', owned: true },
];

const BANNER_COLORS = [
  '#7c9e8f', '#a89080', '#8b9bc4', '#b0977e',
  '#7ea896', '#c49a6c', '#8ba3b0', '#9e8fb0',
];

export function ProfilePage() {
  const [profile,       setProfile_]     = useState<ProfileData>(readProfile);
  const [equippedSkin,  setEquippedSkin]  = useState<string>(
    () => { try { return window.localStorage.getItem(PROFILE_SKIN_KEY) ?? 'default'; } catch { return 'default'; } }
  );
  const [saved,        setSaved]        = useState(false);
  const [previewSkin,  setPreviewSkin]  = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const equippedSkinRef = useRef(equippedSkin);
  const previewSkinRef  = useRef(previewSkin);
  useEffect(() => { equippedSkinRef.current = equippedSkin; }, [equippedSkin]);
  useEffect(() => { previewSkinRef.current  = previewSkin;  }, [previewSkin]);

  useEffect(() => {
    return () => {
      if (previewSkinRef.current !== null) {
        applySkin(equippedSkinRef.current);
      }
    };
  }, []);

  const update = (patch: Partial<ProfileData>) => {
    setProfile_((p) => { const next = { ...p, ...patch }; writeProfile(next); return next; });
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') update({ avatar: result });
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    update({ avatar: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const equipSkin = (id: string) => {
    setEquippedSkin(id);
    setPreviewSkin(null);
    try { window.localStorage.setItem(PROFILE_SKIN_KEY, id); } catch {}
    applySkin(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handlePreview = (id: string) => {
    setPreviewSkin(id);
    applySkin(id);
  };

  const handleCancelPreview = () => {
    setPreviewSkin(null);
    applySkin(equippedSkin);
  };

  const displayInitial = profile.name.trim() ? profile.name.trim()[0].toUpperCase() : '?';
  const previewingSkinName = previewSkin ? (CUBICAL_SKINS.find((s) => s.id === previewSkin)?.name ?? previewSkin) : null;

  return (
    <section className="profile-page">
      <BackButton />

      <div className="profile-hero">
        <div className="profile-banner" style={{ background: profile.bannerColor }}>
          <div className="profile-banner-colors">
            {BANNER_COLORS.map((c) => (
              <button
                key={c}
                className={`profile-color-swatch${profile.bannerColor === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => update({ bannerColor: c })}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="profile-avatar-wrap">
          {profile.avatar
            ? <img src={profile.avatar} alt="Profile" className="profile-avatar" />
            : <div className="profile-avatar profile-avatar-placeholder">{displayInitial}</div>
          }
          <button className="profile-avatar-edit" onClick={() => fileInputRef.current?.click()} title="Change picture">
            <ImagePlus className="w-3.5 h-3.5" />
          </button>
          {profile.avatar && (
            <button className="profile-avatar-remove" onClick={removeAvatar} title="Remove picture">
              <X className="w-3 h-3" />
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
        </div>
      </div>

      <div className="profile-identity">
        <div className="eyebrow">Your identity</div>
        <div className="settings-field mt-4" style={{ maxWidth: 360 }}>
          <label className="settings-label" htmlFor="profile-name">Display name</label>
          <input
            id="profile-name"
            className="settings-input"
            type="text"
            placeholder="What should we call you?"
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={40}
          />
        </div>
        {saved && (
          <div className="profile-saved-badge">
            <Check className="w-3 h-3" /> Saved
          </div>
        )}
      </div>

      <div className="profile-skins">
        <div className="eyebrow mt-10 mb-1">Your skins</div>
        <p className="settings-hint mb-5">Choose how Cubical looks and feels. More skins coming soon.</p>
        <div className="skins-grid">
          {CUBICAL_SKINS.map((skin) => {
            const isPreviewing = previewSkin === skin.id;
            const isEquipped   = equippedSkin === skin.id && !skin.comingSoon;
            return (
              <div
                key={skin.id}
                className={`skin-card${skin.comingSoon ? ' skin-locked' : ''}${isEquipped ? ' skin-equipped' : ''}${isPreviewing ? ' skin-previewing' : ''}`}
                data-testid={`card-skin-${skin.id}`}
              >
                <div className="skin-preview">
                  {skin.id === 'default' && (
                    <div className="skin-preview-default">
                      <div className="spd-sidebar" />
                      <div className="spd-main">
                        <div className="spd-bar" />
                        <div className="spd-card" />
                        <div className="spd-card spd-card-sm" />
                      </div>
                    </div>
                  )}
                  {skin.id === 'sakura' && (
                    <img src={import.meta.env.BASE_URL + 'sakura-env.png'} className="skin-preview-sakura-img" alt="Sakura environment" draggable={false} />
                  )}
                  {skin.comingSoon && <div className="skin-coming-soon-badge">Coming soon</div>}
                  {isEquipped && !isPreviewing && (
                    <div className="skin-equipped-badge"><Check className="w-3 h-3" /> Equipped</div>
                  )}
                  {isPreviewing && (
                    <div className="skin-previewing-badge"><Sparkles className="w-3 h-3" /> Previewing</div>
                  )}
                </div>
                <div className="skin-body">
                  <div className="skin-name">{skin.name}</div>
                  <p className="skin-desc">{skin.description}</p>
                  <div className="skin-footer">
                    {skin.comingSoon
                      ? <span className="skin-soon-label">Not yet available</span>
                      : isEquipped
                        ? <span className="skin-active-label">Currently equipped</span>
                        : (
                          <div className="skin-actions">
                            {!isPreviewing && (
                              <button className="button-quiet skin-preview-btn" onClick={() => handlePreview(skin.id)}>Preview</button>
                            )}
                            <button className="button-quiet skin-equip-btn" onClick={() => equipSkin(skin.id)}>Equip</button>
                          </div>
                        )
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {previewSkin && previewingSkinName && createPortal(
        <div className="skin-preview-banner" role="status" aria-live="polite">
          <Sparkles className="skin-preview-banner-icon" />
          <span className="skin-preview-banner-text">
            Previewing <strong>{previewingSkinName}</strong> — equip to keep it
          </span>
          <div className="skin-preview-banner-actions">
            <button className="skin-preview-cancel-btn" onClick={handleCancelPreview}>Cancel</button>
            <button className="button-primary skin-preview-equip-btn" onClick={() => equipSkin(previewSkin)}>Equip</button>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
