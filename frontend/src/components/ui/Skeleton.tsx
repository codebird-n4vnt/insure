export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="bg-surface-container-lowest/80 rounded-[16px] border border-white/50 p-[32px] floating-shadow" aria-busy="true">
      <Skeleton className="h-7 w-36 mb-6 rounded-full" />
      <Skeleton className="h-5 w-3/4 mb-6" />
      <div className="grid grid-cols-2 gap-6 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}
