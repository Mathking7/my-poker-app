import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl">
          <h1 className="text-xl font-black text-amber-300">页面暂时无法显示</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            对局数据仍保存在房间中。请刷新页面重新进入；如果问题重复出现，保留当前房号方便定位。
          </p>
          <button
            type="button"
            className="mt-5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
