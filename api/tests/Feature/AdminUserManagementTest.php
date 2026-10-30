<?php

namespace Tests\Feature;

use App\Commerce\AuditTrail;
use App\Security\JwtSessions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        if (! str_starts_with((string) getenv('DB_DATABASE'), 'rf023_test_')) {
            throw new \LogicException('Usar el ensayo aislado de usuarios.');
        }
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function actor(string $role = 'admin'): string
    {
        $id = (string) Str::uuid();
        DB::table('users')->insert(['id' => $id, 'name' => 'Cuenta '.$role, 'email' => $id.'@example.test', 'password_hash' => password_hash('Synthetic-only-1234', PASSWORD_BCRYPT, ['cost' => 4]), 'role' => $role]);

        return $id;
    }

    private function authenticate(string $id): string
    {
        $this->defaultHeaders = [];
        $this->defaultCookies = [];
        $this->unencryptedCookies = [];
        $token = app(JwtSessions::class)->issue($id);
        $this->withToken($token);

        return $token;
    }

    private function payload(string $role = 'cliente'): array
    {
        return ['name' => 'Cuenta nueva', 'email' => 'nuevo@example.test', 'role' => $role, 'phone' => '+56 9 1234 5678', 'password' => 'Initial-synthetic-123', 'password_confirmation' => 'Initial-synthetic-123'];
    }

    #[TestWith(['admin'])]
    #[TestWith(['barbero'])]
    #[TestWith(['cliente'])]
    public function test_creation_creates_profile_and_never_discloses_secrets(string $role): void
    {
        $this->authenticate($this->actor());
        $response = $this->postJson('/api/users', $this->payload($role))->assertCreated()->assertJsonPath('user.role', $role)->assertJsonPath('user.active', true);
        $id = $response->json('user.id');
        $this->assertTrue(password_verify('Initial-synthetic-123', DB::table('users')->where('id', $id)->value('password_hash')));
        $this->assertSame($role === 'cliente' ? 1 : 0, DB::table('clients')->where('user_id', $id)->count());
        $this->assertSame($role === 'barbero' ? 1 : 0, DB::table('barbers')->where('user_id', $id)->count());
        $this->assertSame(['id', 'name', 'email', 'phone', 'role', 'active', 'disabled_at', 'created_at'], array_keys($response->json('user')));
        $this->getJson('/api/users')->assertOk()->assertDontSee('password_hash')->assertDontSee('Initial-synthetic-123')->assertDontSee('jti');
        $audit = DB::table('audit_log')->first();
        $this->assertStringNotContainsString('password', $audit->after_data);
        $this->assertStringNotContainsString('Initial-synthetic-123', $audit->after_data);
        Http::assertNothingSent();
    }

    #[TestWith(['cliente'])]
    #[TestWith(['barbero'])]
    public function test_other_roles_cannot_list_or_mutate_users(string $role): void
    {
        $target = $this->actor();
        $this->authenticate($this->actor($role));
        $this->getJson('/api/users')->assertForbidden();
        $this->postJson('/api/users', $this->payload())->assertForbidden();
        $this->patchJson('/api/users/'.$target, ['role' => 'cliente'])->assertForbidden();
        $this->patchJson('/api/users/'.$target.'/password', ['password' => 'New-synthetic-123', 'password_confirmation' => 'New-synthetic-123'])->assertForbidden();
        $this->patchJson('/api/users/'.$target.'/status', ['active' => false])->assertForbidden();
        $this->deleteJson('/api/users/'.$target)->assertForbidden();
        $this->assertDatabaseCount('audit_log', 0);
    }

    public function test_anonymous_and_mass_assignment_requests_are_rejected(): void
    {
        $this->getJson('/api/users')->assertUnauthorized();
        $this->authenticate($this->actor());
        $this->postJson('/api/users', [...$this->payload(), 'password_hash' => 'injected'])->assertStatus(400);
        $this->getJson('/api/users?include=password_hash')->assertStatus(400);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_role_changes_preserve_profiles_loyalty_and_previous_barber_catalog(): void
    {
        $this->authenticate($this->actor());
        $id = $this->postJson('/api/users', $this->payload())->assertCreated()->json('user.id');
        $client = DB::table('clients')->where('user_id', $id)->first();
        DB::table('clients')->where('id', $client->id)->update(['loyalty_points' => 250, 'loyalty_level' => 'Oro']);
        $token = app(JwtSessions::class)->issue($id);
        $this->patchJson('/api/users/'.$id, ['role' => 'barbero'])->assertOk();
        $barber = DB::table('barbers')->where('user_id', $id)->first();
        $this->assertNotNull($barber);
        $this->assertDatabaseHas('clients', ['id' => $client->id, 'loyalty_points' => 250]);
        $this->patchJson('/api/users/'.$id, ['role' => 'admin'])->assertOk();
        $this->assertDatabaseHas('barbers', ['id' => $barber->id, 'active' => 0]);
        $this->patchJson('/api/users/'.$id, ['role' => 'barbero'])->assertOk();
        $this->assertDatabaseHas('barbers', ['id' => $barber->id, 'active' => 0]);
        $this->assertSame(1, DB::table('clients')->where('user_id', $id)->count());
        $this->assertSame(1, DB::table('barbers')->where('user_id', $id)->count());
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_disable_and_reactivate_preserve_records_but_not_old_sessions(): void
    {
        $this->authenticate($this->actor());
        $id = $this->postJson('/api/users', $this->payload())->assertCreated()->json('user.id');
        $token = app(JwtSessions::class)->issue($id);
        $this->deleteJson('/api/users/'.$id)->assertOk()->assertJsonPath('user.active', false);
        $this->assertDatabaseHas('users', ['id' => $id]);
        $this->assertSame(1, DB::table('clients')->where('user_id', $id)->count());
        $this->patchJson('/api/users/'.$id.'/status', ['active' => true])->assertOk()->assertJsonPath('user.active', true);
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
        $this->defaultHeaders = [];
        $csrf = $this->getJson('/api/auth/csrf')->assertOk()->json('csrfToken');
        $this->withCredentials()->withUnencryptedCookie('bl_csrf', $csrf)->withHeaders(['Origin' => config('jwt.origin'), 'X-CSRF-Token' => $csrf]);
        $this->postJson('/api/auth/login', ['email' => 'nuevo@example.test', 'password' => 'Initial-synthetic-123'])->assertOk();
    }

    public function test_password_and_email_changes_revoke_sessions_and_audit_no_credentials(): void
    {
        $admin = $this->actor();
        $this->authenticate($admin);
        $id = $this->postJson('/api/users', $this->payload())->assertCreated()->json('user.id');
        $old = app(JwtSessions::class)->issue($id);
        $this->patchJson('/api/users/'.$id.'/password', ['password' => 'Changed-synthetic-123', 'password_confirmation' => 'Changed-synthetic-123'])->assertOk()->assertDontSee('Changed-synthetic-123')->assertDontSee('password_hash');
        $this->withToken($old)->getJson('/api/auth/me')->assertUnauthorized();
        $this->authenticate($admin);
        $current = app(JwtSessions::class)->issue($id);
        $this->patchJson('/api/users/'.$id, ['email' => ' CAMBIO@Example.Test '])->assertOk()->assertJsonPath('user.email', 'cambio@example.test');
        $this->withToken($current)->getJson('/api/auth/me')->assertUnauthorized();
        $this->assertTrue(password_verify('Changed-synthetic-123', DB::table('users')->where('id', $id)->value('password_hash')));
        foreach (DB::table('audit_log')->get() as $audit) {
            $this->assertStringNotContainsString('Changed-synthetic', $audit->after_data ?? '');
            $this->assertStringNotContainsString('password_hash', $audit->after_data ?? '');
        }
    }

    public function test_self_disable_and_role_change_are_rejected(): void
    {
        $id = $this->actor();
        $this->authenticate($id);
        $this->deleteJson('/api/users/'.$id)->assertStatus(409);
        $this->patchJson('/api/users/'.$id.'/status', ['active' => false])->assertStatus(409);
        $this->patchJson('/api/users/'.$id, ['role' => 'cliente'])->assertStatus(409);
        $this->patchJson('/api/users/'.$id, ['name' => 'Mi nombre actualizado'])->assertOk();
        $this->assertSame(1, DB::table('users')->where('role', 'admin')->whereNull('deleted_at')->count());
    }

    public function test_duplicate_email_or_invalid_password_leaves_no_partial_data(): void
    {
        $this->authenticate($this->actor());
        $this->postJson('/api/users', $this->payload())->assertCreated();
        $this->postJson('/api/users', [...$this->payload('barbero'), 'email' => 'NUEVO@example.test'])->assertStatus(409);
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('barbers', 0);
        foreach ([['password' => 'short', 'password_confirmation' => 'short'], ['password' => str_repeat('é', 40), 'password_confirmation' => str_repeat('é', 40)], ['password' => 'Valid-synthetic-123', 'password_confirmation' => 'different']] as $invalid) {
            $this->postJson('/api/users', [...$this->payload(), 'email' => 'other@example.test', ...$invalid])->assertStatus(400);
        }
        $this->assertDatabaseCount('users', 2);
    }

    public function test_audit_failure_rolls_back_user_and_profile(): void
    {
        $this->authenticate($this->actor());
        $this->mock(AuditTrail::class)->shouldReceive('record')->once()->andThrow(new \RuntimeException('synthetic rollback'));
        $this->postJson('/api/users', $this->payload('barbero'))->assertStatus(500);
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('barbers', 0);
    }

    public function test_audit_failure_rolls_back_email_and_session_revocation(): void
    {
        $this->authenticate($this->actor());
        $id = $this->postJson('/api/users', $this->payload())->assertCreated()->json('user.id');
        $token = app(JwtSessions::class)->issue($id);
        $this->mock(AuditTrail::class)->shouldReceive('record')->once()->andThrow(new \RuntimeException('synthetic rollback'));
        $this->patchJson('/api/users/'.$id, ['email' => 'rollback@example.test'])->assertStatus(500);
        $this->assertDatabaseHas('users', ['id' => $id, 'email' => 'nuevo@example.test']);
        $this->withToken($token)->getJson('/api/auth/me')->assertOk();
    }

    public function test_legacy_accounts_with_unknown_creation_date_are_projected_without_secrets(): void
    {
        $this->authenticate($this->actor());
        $id = $this->actor('cliente');
        DB::table('users')->where('id', $id)->update(['created_at' => null, 'deleted_at' => '2026-10-01 00:00:00']);
        $users = $this->getJson('/api/users')->assertOk()->json('users');
        $user = collect($users)->firstWhere('id', $id);
        $this->assertNull($user['created_at']);
        $this->assertFalse($user['active']);
        $this->assertArrayNotHasKey('password_hash', $user);
    }
}
