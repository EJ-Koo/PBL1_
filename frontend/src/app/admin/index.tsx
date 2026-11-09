import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminConfigPanel, AdminItemsPanel, AdminWalletsPanel } from '@/components/admin/admin-shop-panels';

import {
  apiAdminDeleteDiary,
  apiAdminDeleteUser,
  apiAdminListDiaries,
  apiAdminListUsers,
  type ApiAdminDiary,
  type ApiAdminUser,
} from '@/lib/api';
import { confirmAction, showNotice } from '@/lib/notice';
import { useAdmin } from '@/store/admin-context';

// [MODIFIED 2026-11-07] 상점 아이템 · 사용자 코인 · 설정값 탭 추가
type Tab = 'users' | 'diaries' | 'items' | 'wallets' | 'config';

const EXTRA_TABS: { id: Tab; label: string }[] = [
  { id: 'items', label: '상점' },
  { id: 'wallets', label: '코인' },
  { id: 'config', label: '설정' },
];

export default function AdminDashboardScreen() {
  const { isAdminLoggedIn, adminToken, adminUsername, adminLogout } = useAdmin();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [diaries, setDiaries] = useState<ApiAdminDiary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!adminToken) return;
    setIsLoading(true);
    try {
      const [userList, diaryList] = await Promise.all([
        apiAdminListUsers(adminToken),
        apiAdminListDiaries(adminToken),
      ]);
      setUsers(userList);
      setDiaries(diaryList);
    } catch (err) {
      showNotice('불러오기 실패', err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (!isAdminLoggedIn) {
      router.replace('/admin/login');
      return;
    }
    loadData();
  }, [isAdminLoggedIn, loadData]);

  const handleLogout = () => {
    adminLogout();
    router.replace('/admin/login');
  };

  const handleDeleteUser = (user: ApiAdminUser) => {
    confirmAction('유저 삭제', `${user.email ?? user.user_id}를 삭제할까요? 이 유저의 일기도 모두 삭제됩니다.`, async () => {
      if (!adminToken) return;
      try {
        await apiAdminDeleteUser(adminToken, user.user_id);
        setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));
        setDiaries((prev) => prev.filter((d) => d.user_id !== user.user_id));
      } catch (err) {
        showNotice('삭제 실패', err instanceof Error ? err.message : '유저 삭제에 실패했습니다.');
      }
    });
  };

  const handleDeleteDiary = (diary: ApiAdminDiary) => {
    confirmAction('일기 삭제', '이 일기를 삭제할까요?', async () => {
      if (!adminToken) return;
      try {
        await apiAdminDeleteDiary(adminToken, diary.id);
        setDiaries((prev) => prev.filter((d) => d.id !== diary.id));
      } catch (err) {
        showNotice('삭제 실패', err instanceof Error ? err.message : '일기 삭제에 실패했습니다.');
      }
    });
  };

  if (!isAdminLoggedIn) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>관리자 대시보드</Text>
        <Text style={styles.subtitle}>{adminUsername}님</Text>
        <Pressable onPress={handleLogout}>
          <Text style={styles.logoutLink}>로그아웃</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'users' && styles.tabActive]} onPress={() => setTab('users')}>
          <Text style={[styles.tabText, tab === 'users' && styles.tabTextActive]}>
            유저 ({users.length})
          </Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'diaries' && styles.tabActive]} onPress={() => setTab('diaries')}>
          <Text style={[styles.tabText, tab === 'diaries' && styles.tabTextActive]}>
            일기 ({diaries.length})
          </Text>
        </Pressable>
        {EXTRA_TABS.map((t) => (
          <Pressable key={t.id} testID={`admin-tab-${t.id}`} style={[styles.tab, tab === t.id && styles.tabActive]} onPress={() => setTab(t.id)}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'items' && adminToken ? (
        <AdminItemsPanel token={adminToken} />
      ) : tab === 'wallets' && adminToken ? (
        <AdminWalletsPanel token={adminToken} />
      ) : tab === 'config' && adminToken ? (
        <AdminConfigPanel token={adminToken} />
      ) : tab === 'users' ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.user_id}
          refreshing={isLoading}
          onRefresh={loadData}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>유저가 없습니다.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>{item.nickname ?? '(닉네임 없음)'}</Text>
                <Text style={styles.rowMeta}>{item.email}</Text>
                <Text style={styles.rowMeta}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteUser(item)}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={diaries}
          keyExtractor={(item) => item.id}
          refreshing={isLoading}
          onRefresh={loadData}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>일기가 없습니다.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.content}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.nickname ?? item.user_id} · {item.visibility}
                </Text>
                <Text style={styles.rowMeta}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Pressable style={styles.deleteButton} onPress={() => handleDeleteDiary(item)}>
                <Text style={styles.deleteButtonText}>삭제</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B1A',
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 13,
    color: '#9C9CC0',
    marginTop: 4,
  },
  logoutLink: {
    color: '#F66C9E',
    fontSize: 13,
    marginTop: 8,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#14142A',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#7C6CF6',
  },
  tabText: {
    color: '#9C9CC0',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  list: {
    paddingBottom: 32,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A45',
    padding: 14,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#9C9CC0',
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: '#3A1F2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 12,
  },
  deleteButtonText: {
    color: '#F66C9E',
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    color: '#9C9CC0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
