import { useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getPage } from '../api';
import { Loading, Error } from '../components';
import { colors } from '../theme';

export default function EmployeesScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  async function load(p = 1, keyword = search, div = divisionId) {
    setError('');
    try {
      const params = new URLSearchParams();
      if (p > 1) params.set('page', p);
      if (keyword) params.set('search', keyword);
      if (div) params.set('division_id', div);
      const qs = params.toString();
      const props = await getPage('/employees' + (qs ? `?${qs}` : ''));
      setData((prev) => {
        if (p > 1 && prev && prev.employees) {
          return {
            ...props,
            employees: {
              ...props.employees,
              data: [...(prev.employees.data || []), ...(props.employees.data || [])],
            },
          };
        }
        return props;
      });
      setPage(p);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load(1, '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch() {
    setPage(1);
    load(1, search, divisionId);
  }

  async function refresh() {
    setRefreshing(true);
    await load(1, search, divisionId);
    setRefreshing(false);
  }

  function loadMore() {
    if (!data?.employees?.next_page_url) return;
    load(page + 1);
  }

  if (error && !data) return <Error message={error} onRetry={() => load(1, search, divisionId)} />;
  if (!data) return <Loading />;

  const employees = data.employees || {};
  const list = employees.data || [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Karyawan</Text>

      <TextInput
        style={styles.input}
        placeholder="Cari nama / NIK..."
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={onSearch}
        returnKeyType="search"
      />

      <ScrollDivisions
        items={data.divisions || []}
        selected={divisionId}
        onSelect={(id) => {
          setDivisionId(id);
          setPage(1);
          load(1, search, id);
        }}
      />

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        onEndReachedThreshold={0.3}
        onEndReached={loadMore}
        ListFooterComponent={
          <Text style={styles.footer}>
            {employees.next_page_url
              ? 'Geser untuk memuat lagi...'
              : `Total ${employees.total || 0} karyawan`}
          </Text>
        }
        renderItem={({ item }) => (
          <EmployeeCard item={item} divisions={data.divisions} positions={data.positions} />
        )}
      />
    </View>
  );
}

function EmployeeCard({ item, divisions, positions }) {
  const div = (divisions || []).find((d) => d.id === item.division_id);
  const pos = (positions || []).find((p) => p.id === item.position_id);
  const active = item.is_active;
  const initial = `${item.firstname || ''}${item.lastname || ''}`
    .trim()
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial || '·'}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.firstname} {item.lastname || ''}
          </Text>
          <View
            style={[
              styles.badge,
              active ? styles.badgeActive : styles.badgeInactive,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: active ? colors.green : colors.red },
              ]}
            >
              {active ? 'Aktif' : 'Nonaktif'}
            </Text>
          </View>
        </View>
        <Text style={styles.cardSub}>
          {item.employee_id} · {pos?.name || item.position || '-'}
        </Text>
        <Text style={styles.cardSub2}>
          {div?.name || '-'} · {item.employee_type}
        </Text>
      </View>
    </View>
  );
}

function ScrollDivisions({ items, selected, onSelect }) {
  const all = [{ id: '', name: 'Semua' }, ...items];
  return (
    <View style={styles.chips}>
      {all.map((d) => (
        <TouchableOpacity
          key={String(d.id)}
          style={[styles.chip, selected === d.id && styles.chipActive]}
          onPress={() => onSelect(d.id)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.chipText,
              selected === d.id && styles.chipTextActive,
            ]}
          >
            {d.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 13,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentLight,
    fontWeight: 'bold',
    fontSize: 15,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 15,
    flex: 1,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeActive: {
    backgroundColor: colors.green + '22',
  },
  badgeInactive: {
    backgroundColor: colors.red + '22',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardSub: {
    color: colors.muted,
    fontSize: 12,
  },
  cardSub2: {
    color: colors.muted,
    fontSize: 11,
  },
  footer: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 12,
    fontSize: 12,
  },
});
